// fetch api requires a disscussion of...
// callbacks, promise, thenables, and async/await it











/* CALLBACKS

function firstfunction(parameters, callback){
    //do stuff
    callback();
}

// problem
// aka "callback hell"
firstfunction(para, function(){
    secondfunction(para, function(){
        thirdfunction(para, function(){
            
        })
    })
})
*/









//PROMISES

//3states: pending, fulfilled, rejected 

// const mypormise = new Promise((resolve, reject) => {
//     const error = false;
//     // const error = true;
//     if (!error) {
//         resolve("yes resolved the promise");
//     }
//     else {
//         reject("no rejected the promise")
//     }
// })

// console.log(mypormise)

// mypormise.then(value => {
//     return value + 1;
// }).then(newvalue => {
//     console.log(newvalue)
// }).catch(err => {
//     console.log(err)
// })//or.catch(() =>{
// // console.log("something went wrong")


// const mynextpromise = new Promise((resolve, reject) => {
//     setTimeout(() => {
//         resolve("mynextpromise resolved!")
//     }, 3000);
// })

// mynextpromise.then(value => {
//     console.log(value)
// })










/*PENDING STATE OF PROMISE
const users = fetch('https://jsonplaceholder.typicode.com/todos/1')
console.log(users);*/







const users = fetch('https://jsonplaceholder.typicode.com/todos/1')
 .then(response => {
   return response.json()
 }).then(data =>{
    console.log(data)
 })//or data.forEach(user => {  ---> if data is more than one
//      console.log(user)    
// })