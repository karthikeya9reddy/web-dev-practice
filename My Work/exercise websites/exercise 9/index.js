let random = Math.random()
let a = prompt("enter first number")
console.log(random)
let b = prompt("enter second number")
let c = prompt("enter operator")

let obj = {
    "+": "-",
    "*": "+",
    "-": "/",
    "/": "**",
}

if(random > 0.1){
   alert(`the result is ${eval(`${a} ${c} ${b}`)}`)
}

else{
    c = obj[c]
   alert(`the result is ${eval(`${a} ${c} ${b}`)}`)
}