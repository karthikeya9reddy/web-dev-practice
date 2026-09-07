 console.log("harry is a hacker")    //|
                                     //|-----> sync code
 console.log("karthik is a hecker")  //|

setTimeout(() => {                              //|
    console.log("i am inside settimout")        //|      
}, 3000);                                       //|          
                                                //|-----> async code           
setTimeout(() => {                              //|
    console.log("i am inside settimout")        //|                            
}, 3000);                                       //|            

console.log("the end")  //|---> sync code 

const fn = () => {
  console.log("nothing")
}

const callback = (arg, fn) => {
    console.log(arg)
    fn()
}

const loadScript = (src, callback) => {
     let sc = document.createElement("script") 
     sc.src = src
     sc.onload = callback("harry", fn)
     document.head.append(sc)   
}

loadScript("https://cdnjs.cloudflare.com/ajax/libs/prism/9000.0.1/prism.min.js",callback )