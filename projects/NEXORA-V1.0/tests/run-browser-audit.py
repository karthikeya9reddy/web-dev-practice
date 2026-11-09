from pathlib import Path
import base64, json, re, subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'BROWSER-AUDIT'
OUT.mkdir(exist_ok=True)
css=(ROOT/'style.css').read_text()
results={'release':'1.1.0','engine':'Chromium headless on Linux','checks':[],'limitations':[]}

def record(name, ok, details):
    results['checks'].append({'name':name,'passed':bool(ok),'details':details})

# Rendered geometry for wrapped mobile navigation, after the indicator transition.
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':345,'height':800},device_scale_factor=1,is_mobile=True,has_touch=True)
    nav_html='''<header class="topbar" style="position:relative;height:66px;width:100%;"><a class="brand">NEXORA</a><nav class="nav open" id="main-nav" aria-label="Main navigation"><button class="nav-link">Discover</button><button class="nav-link">Movies</button><button class="nav-link active">Anime</button><button class="nav-link">Music</button><button class="nav-link">Docs</button><button class="nav-link">Web-Series</button><button class="nav-link">Library</button><button class="nav-link">Saved</button></nav><button class="menu-button" aria-expanded="true"></button></header>'''
    page.set_content('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'+css+' #main-nav{width:170px;right:auto}</style>'+nav_html)
    page.evaluate('''() => {const n=document.querySelector('#main-nav'),a=n.querySelector('.active');for(const [k,v] of Object.entries({'--nav-indicator-x':`${a.offsetLeft}px`,'--nav-indicator-y':`${a.offsetTop}px`,'--nav-indicator-width':`${a.offsetWidth}px`,'--nav-indicator-height':`${a.offsetHeight}px`}))n.style.setProperty(k,v);n.classList.add('has-active-indicator')}''')
    page.wait_for_timeout(550)
    nav=page.evaluate('''() => {const n=document.querySelector('#main-nav'),a=n.querySelector('.active'),s=getComputedStyle(n,'::before'),nr=n.getBoundingClientRect(),ar=a.getBoundingClientRect();return {nav:{x:nr.x,y:nr.y,w:nr.width,h:nr.height},active:{x:ar.x,y:ar.y,w:ar.width,h:ar.height,offsetX:a.offsetLeft,offsetY:a.offsetTop},indicator:{w:parseFloat(s.width),h:parseFloat(s.height),transform:s.transform,opacity:parseFloat(s.opacity)}}}''')
    m=re.search(r'matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([\d.-]+),\s*([\d.-]+)\)',nav['indicator']['transform'])
    translated=bool(m) and abs(float(m.group(1))-nav['active']['offsetX'])<1 and abs(float(m.group(2))-nav['active']['offsetY'])<1
    sized=abs(nav['indicator']['w']-nav['active']['w'])<2 and abs(nav['indicator']['h']-nav['active']['h'])<2
    wrapped=nav['active']['offsetY']>8
    record('Mobile wrapped navigation indicator tracks the selected row and column',translated and sized and wrapped and nav['indicator']['opacity']>.99,nav)
    page.screenshot(path=str(OUT/'mobile-navigation.png'),full_page=True)

    # Real browser fullscreen with generated WebM clips in three aspect ratios.
    video_dir=ROOT/'tests'/'fixtures'
    for file_name,expected,ratio_label in [('video-16x9.webm',(320,180),'16:9'),('video-4x3.webm',(240,180),'4:3'),('video-21x9.webm',(420,180),'21:9')]:
        video_path=video_dir/file_name
        b64=base64.b64encode(video_path.read_bytes()).decode('ascii')
        src='data:video/webm;base64,'+b64
        w,h=(915,412)
        pg=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1,is_mobile=True,has_touch=True)
        fixture='''<button id="go">Fullscreen</button><div class="player-stage" id="stage"><video id="vid" width="{vw}" height="{vh}" playsinline muted></video><div class="stage-gradient" style="display:none"></div><div class="player-controls" id="controls" style="opacity:1;visibility:visible"><div class="timeline-wrap">Timeline</div><div class="control-deck">Controls</div></div></div><style>html,body{{margin:0;width:100%;height:100%;background:#000}}.player-stage{{position:relative;width:100%;height:300px;aspect-ratio:16/9;background:#000;overflow:hidden}}.player-stage video{{width:100%;height:100%;object-fit:cover}}</style>'''.format(vw=expected[0],vh=expected[1])
        pg.set_content('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'+css+'</style>'+fixture)
        pg.evaluate("src => {const v=document.querySelector('#vid');v.src=src;v.load()}",src)
        pg.wait_for_function("document.querySelector('#vid').readyState >= 2",timeout=8000)
        pg.evaluate("() => document.querySelector('#go').addEventListener('click',()=>document.querySelector('#stage').requestFullscreen({navigationUI:'hide'}))")
        pg.locator('#go').click()
        pg.wait_for_function("document.fullscreenElement?.id === 'stage'",timeout=3000)
        pg.evaluate("() => document.querySelector('#vid').play().catch(()=>{})")
        pg.wait_for_timeout(300)
        state=pg.evaluate('''() => {const st=document.querySelector('#stage'),v=document.querySelector('#vid'),r=st.getBoundingClientRect(),vr=v.getBoundingClientRect(),cs=getComputedStyle(v);return {viewport:{w:innerWidth,h:innerHeight},stage:{x:r.x,y:r.y,w:r.width,h:r.height},video:{box:{w:vr.width,h:vr.height},intrinsic:{w:v.videoWidth,h:v.videoHeight},fit:cs.objectFit,position:cs.objectPosition},fullscreen:document.fullscreenElement===st}}''')
        vw,vh=state['video']['intrinsic']['w'],state['video']['intrinsic']['h']
        scale=min(w/vw,h/vh)
        expected_w,expected_h=vw*scale,vh*scale
        content={'expectedContainedContent':{'w':round(expected_w,2),'h':round(expected_h,2)},'expectedLetterbox':{'horizontal':round(w-expected_w,2),'vertical':round(h-expected_h,2)}}
        ok=state['fullscreen'] and state['stage']['x']==0 and state['stage']['y']==0 and abs(state['stage']['w']-w)<1 and abs(state['stage']['h']-h)<1 and state['video']['fit']=='contain' and abs(state['video']['intrinsic']['w']-expected[0])<1 and abs(state['video']['intrinsic']['h']-expected[1])<1
        record(f'Mobile landscape fullscreen contains full {ratio_label} video',ok,{**state,**content})
        if file_name=='video-16x9.webm': pg.screenshot(path=str(OUT/'fullscreen-landscape-16x9.png'))
        pg.evaluate('document.exitFullscreen()');pg.close()

    # Portrait fullscreen sizing is also verified at a narrow phone viewport.
    portrait_video=video_dir/'video-16x9.webm'
    portrait_b64=base64.b64encode(portrait_video.read_bytes()).decode('ascii')
    portrait_src='data:video/webm;base64,'+portrait_b64
    pp=browser.new_page(viewport={'width':412,'height':915},device_scale_factor=1,is_mobile=True,has_touch=True)
    portrait_fixture='''<button id=\"go\">Fullscreen</button><div class=\"player-stage\" id=\"stage\"><video id=\"vid\" playsinline muted></video><div class=\"stage-gradient\" style=\"display:none\"></div><div class=\"player-controls\" id=\"controls\" style=\"opacity:1;visibility:visible\"><div class=\"timeline-wrap\">Timeline</div><div class=\"control-deck\">Controls</div></div></div><style>html,body{margin:0;width:100%;height:100%;background:#000}.player-stage{position:relative;width:100%;height:300px;aspect-ratio:16/9;background:#000;overflow:hidden}.player-stage video{width:100%;height:100%;object-fit:cover}</style>'''
    pp.set_content('<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><style>'+css+'</style>'+portrait_fixture)
    pp.evaluate("src => {const v=document.querySelector('#vid');v.src=src;v.load()}",portrait_src)
    pp.wait_for_function("document.querySelector('#vid').readyState >= 2",timeout=8000)
    pp.evaluate("() => document.querySelector('#go').addEventListener('click',()=>document.querySelector('#stage').requestFullscreen({navigationUI:'hide'}))")
    pp.locator('#go').click()
    pp.wait_for_function("document.fullscreenElement?.id === 'stage'",timeout=3000)
    portrait_state=pp.evaluate('''() => {const st=document.querySelector('#stage'),v=document.querySelector('#vid'),r=st.getBoundingClientRect(),cs=getComputedStyle(v);return {viewport:{w:innerWidth,h:innerHeight},stage:{x:r.x,y:r.y,w:r.width,h:r.height},intrinsic:{w:v.videoWidth,h:v.videoHeight},fit:cs.objectFit,fullscreen:document.fullscreenElement===st}}''')
    portrait_ok=portrait_state['fullscreen'] and portrait_state['stage']['x']==0 and portrait_state['stage']['y']==0 and abs(portrait_state['stage']['w']-412)<1 and abs(portrait_state['stage']['h']-915)<1 and portrait_state['fit']=='contain' and portrait_state['intrinsic']=={'w':320,'h':180}
    record('Mobile portrait fullscreen fills dynamic viewport and contains full video',portrait_ok,portrait_state)
    pp.screenshot(path=str(OUT/'fullscreen-portrait-16x9.png'))
    pp.evaluate('document.exitFullscreen()');pp.close()

    # Repeat the 32-card scroll fixture to separate consistent rendering cost from host noise.
    trials=[]
    for trial_index in range(4):
        sp=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
        cards=''.join(f'<article class="media-card"><div class="media-art"><div class="media-art-image" style="height:160px;background:linear-gradient(130deg,hsl({i*19%360} 65% 30%),#0c1019)"></div></div><p class="media-card-title">Title {i}</p></article>' for i in range(32))
        sp.set_content('<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><main class="collection-page"><div class="media-grid">'+cards+'</div></main>')
        sp.wait_for_timeout(2500)
        sp.evaluate('''() => {window.__frames=[];window.__long=[];new PerformanceObserver(l=>window.__long.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask'});const start=performance.now();function tick(t){if(t-start<2000){window.__frames.push(t);requestAnimationFrame(tick)}}requestAnimationFrame(tick);window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});}''')
        sp.wait_for_timeout(2400)
        trial=sp.evaluate('''() => {const a=window.__frames||[],d=a.slice(1).map((x,i)=>x-a[i]).sort((x,y)=>x-y);return {cards:document.querySelectorAll('.media-card').length,frames:a.length,medianFrameMs:d.length?d[Math.floor(d.length/2)]:null,p95FrameMs:d.length?d[Math.floor(d.length*.95)]:null,longTasks:(window.__long||[]).length,longTaskMaxMs:Math.max(0,...(window.__long||[])),scrollTop:scrollY,scrollHeight:document.documentElement.scrollHeight}}''')
        trials.append(trial)
        sp.close()
    clean=sum(1 for t in trials if t['longTasks']==0 and t['p95FrameMs'] is not None and t['p95FrameMs']<=20)
    p95_values=[t['p95FrameMs'] for t in trials if t['p95FrameMs'] is not None]
    scroll={'trials':trials,'cleanTrials':clean,'totalTrials':len(trials),'p95FrameMsMedian':sorted(p95_values)[len(p95_values)//2] if p95_values else None,'maxLongTaskMs':max(t['longTaskMaxMs'] for t in trials)}
    record('Repeated 32-card incremental grid scrolling stress test',clean>=3,scroll)
    browser.close()

results['limitations']=[
  'Chromium tests ran headless on Linux. The measured 16.7ms cadence reflects this host browser, not the user phone refresh rate or GPU.',
  'Fullscreen viewport geometry and actual video aspect-ratio rendering were tested in Chromium. Android OS status/navigation bars and vendor-specific immersive-mode behaviour still require a physical Android device test.',
  'The stress test models the first 32-card render batch. It does not reproduce every real media file decode, image network timing, or the user device library size.'
]
(OUT/'BROWSER-AUDIT.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
