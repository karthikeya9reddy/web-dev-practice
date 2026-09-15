/*IIFE( immedieatly invoke function expression )advance concept in javascript
async function sleep(){
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(45)
        }, 1000);
    })
}

(async function main() {
    let a = await sleep()
    console.log(a)
    let b = await sleep()
    console.log(b)
})()*/



/*DESTRUCTURING advanced concept in javascript
async function sleep(){
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(45)
        }, 1000);
    })
}

(async function main() {
    let[x,y, ...rest] = [1, 4, 5, 7, 3, 10]
    console.log(x,y,rest)
})()*/



/*DESTRUCTURING in objects advanced concept in javascript
async function sleep(){
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(45)
        }, 1000);
    })
}

(async function main() {
    let obj = {
        a: 1,
        b: 2,
        c: 3
    }
    let {a,b} = obj
    console.log(a,b)
})() */



//SPREAD OPERATOR advanced concept in javascript
async function sleep(){
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(45)
        }, 1000);
    })
}

function sum(a, b, c){
     return a+b+c;
}

(async function main() {
    let arr = [2, 3, 4]
    console.log(sum(arr[0], arr[1], arr[2]))
    console.log(sum(...arr))
})()

/*
summary of the video 

IIFE (Immediately Invoked Function Expression): A function defined and executed immediately (2:40). It is useful for running asynchronous code (like await inside a non-async environment) without needing to name or explicitly call a separate function.

Destructuring: A syntax that allows you to unpack values from arrays or properties from objects into distinct variables (3:39). It simplifies code by extracting only the specific data needed (6:24).

Rest Operator (...): Used during destructuring to collect the remaining elements of an array into a new array (4:49). This prevents ignoring data when only partial information is needed.

Spread Operator (...): The inverse of rest, it "spreads" the contents of an array or object into individual elements (8:00). It is commonly used to pass array elements as separate arguments to a function (8:34).

Hoisting: The behavior where variable and function declarations are moved to the top of their scope before code execution (9:53).

var variables are hoisted but initialized as undefined (10:14).
let and const declarations are not hoisted in the same way; accessing them before initialization results in a reference error (12:52).

Scope: The video distinguishes between Global, Local (Function), and Block scope (9:20). Variables declared with let and const are block-scoped, meaning they exist only within the nearest set of curly braces.
*/