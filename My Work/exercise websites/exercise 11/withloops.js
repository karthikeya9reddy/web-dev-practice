//using loops

let a = prompt("enter the value of factorial")

function factorial(n){
     let result = 1
     for (let i = 2; i <= n; i++) {
          result = result*i
     }
     return result
}

alert("the result of the factorial of "+a+" is "+ factorial(a))


// recursive method 

// let a = prompt("enter the value of factorial")

// function factorial(n){
//      if (n<=1) {
//           return 1;
//      }
//     return(n*factorial(n-1)) //----> recursion calling a function itself
// }


// alert("the result of the factorial of "+a+" is "+ factorial(a))