let button = document.getElementById("btn")

// List of all mouse events 
// https://developer.mozilla.org/en-US/docs/Web/API/Element#mouse_events

// button.addEventListener("click", ()=>{
//     // alert("i was clicked. yayy!")
//     document.querySelector(".box").innerHTML = "<b> Yayy!! you were clicked</b>"
// })

button.addEventListener("dblclick", ()=>{
    // alert("i was clicked. yayy!")
    document.querySelector(".box").innerHTML = "<b> Yayy!! you were clicked</b>"
})

button.addEventListener("contextmenu", ()=>{
    alert("dont hack us by right click please")
})

button.addEventListener("keydown", (e)=>{
    console.log(e.key, e.keyCode, e)
})