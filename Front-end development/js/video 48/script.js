let a = prompt("enter first number")

let b = prompt("ente second number")

if (isNaN(a) || isNaN(b)){
    throw SyntaxError("invalid input entered")
}
 
let sum = parseInt(a) + parseInt(b)

function main(){
    let d = 1;
    try {
        console.log("the sum is ", sum*d)
        return true
    } catch (error) {
        console.log("error vacchindi raa bosada")
        return false
    }
    finally{
        console.log("files are beign closed and db connection is biegn closed")
    }
}
 let c = main()

 /*
 summary of the video 

Throwing Errors (throw): When user input or data is invalid, you can manually trigger an error to stop execution and alert the user (5:22). For example, using throw new SyntaxError(...) stops the script when invalid numbers are provided (5:46, 6:28).

Try-Catch Blocks: This is the core construct for error handling (8:15).
try: Contains the code you want to execute (8:27).
catch: Contains the code that runs only if an error occurs within the try block (8:35). This prevents the program from failing completely and allows you to log the error or take alternative action (8:45).

Error Objects: When an error is caught, it returns an object containing information about the error, such as the name, message, and stack (10:22).

The finally Clause: This block of code executes regardless of whether an error occurred (10:35). It is primarily used for cleanup tasks like closing files or database connections (11:06).

Why finally is essential:
While a simple script might seem to work without it, finally is critical inside functions that use return statements (13:14). If you return a value inside a try block, the code below it normally wouldn't run, but the finally block ensures that cleanup tasks (like closing a database) are completed before the function exits 
*/


