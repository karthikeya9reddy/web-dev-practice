// async function getdata(){
//     //stimulate getting data from a server
//     return new Promise((resolve, reject)=>{
//         setTimeout(() => {
//             resolve(455)
//         }, 3500);
//     })
// }

// settle means resolve or reject 
// resolve means promise has settled sucessfully
// reject means promise has not settled sucessfully

async function getdata() {
    //stimulate getting data from a server
    // let x = fetch('https://jsonplaceholder.typicode.com/todos/1')
    let x = await fetch('https://jsonplaceholder.typicode.com/posts', {
        method: 'POST',
        body: JSON.stringify({
            title: 'foo',
            body: 'bar',
            userId: 1,
        }),
        headers: {
            'Content-type': 'application/json; charset=UTF-8',
        },
    })
    let data = await x.json()
    return data
}

async function main() {

    console.log("loading modules")

    console.log("do something else")

    console.log("load data")

    let data = await getdata()
    console.log(data)

    console.log("process data")
    console.log("task 2")
}
main()

/*
summary of the video 

Promises (1:11): Think of a Promise as a placeholder for a future result. When a function (like getData) needs to fetch information from a server, it doesn't have the data immediately. Instead, it returns a "Promise" object, which essentially says, "I promise to give you a result later, whether it succeeds or fails."

Asynchronous Code (4:30): JavaScript typically executes line-by-line. If a process takes a long time, the browser doesn't want the entire page to freeze. Asynchronous code allows the program to initiate a task in the background and continue running other tasks while waiting for the background process to finish.

Async/Await (6:18): This is a cleaner, more readable way to handle Promises.

async: By adding this keyword before a function, you tell JavaScript that this function will handle asynchronous operations and will automatically return a promise.

await: This keyword is used inside an async function. It tells the code, "Pause here and wait for this specific promise to resolve before moving to the next line." It makes asynchronous code look and behave more like simple, synchronous code.

Fetch API (10:10): This is a built-in tool in browsers used to make network requests (like getting data from an API). It returns a promise that resolves to the response object. You then typically use .json() to parse that response, which also returns a promise, requiring another await.

Settled (14:26): A Promise is "settled" once it has finished its work. It has two possible outcomes:
Resolved: The task was completed successfully.
Rejected: The task failed (e.g., a network error).

Why use Async/Await?
Before this, developers relied on .then() chains, which could become messy and hard to manage (often called "callback hell"). Async/await simplifies this, making your code easier to write, read, and debug.

Request Types:
GET Request (19:44): The default method used to retrieve data from a server (like loading a webpage).
POST Request (20:01): Used to send data to a server (like submitting a form or logging in). It is more secure for handling sensitive information compared to GET requests.
*/