// function nice(name){
    
//     console.log("hey " + name + " you are nice!")
//     console.log("hey " + name + " you are good!")
//     console.log("hey " + name + " you t-shirt is nice!")
//     console.log("hey " + name + " you course is good too !")
// }
// nice("harry")
// nice("rohan")

function sum(a,b, c=4){
    // console.log(a + b)
    return a + b + c;
}
// sum(4, 5)
// result1 = sum(4, 5)
result2 = sum(55,434)
result3 = sum(33, 565, 1)
console.log("the sum of these numbers is: ", sum(4,5))
console.log("the sum of these numbers is: ", result2)
console.log("the sum of these numbers is: ", result3)



//arrow function
const func1 = (x)=>{
    console.log("i am an arrow function", x)
}

func1(23);
func1(87);
func1(97);

/* 
summary of the video 

Functions (0:42): A block of reusable code designed to perform a specific task. By packaging code into a function, you can execute it multiple times with different inputs rather than rewriting the same logic.

Parameters & Arguments (2:12): Parameters act as placeholders within the function definition, while the actual values passed during a function call are called arguments. For example, a function might accept a name parameter to customize a greeting.

Returning Values (5:37): The return keyword is used to send a value back from the function to where it was called. This allows the function to compute a result (like the sum of two numbers) and store that result in a variable for later use.

Default Parameters (7:00): You can assign a default value to a parameter (e.g., c = 3). If the user does not provide an argument for that parameter, the function automatically uses the default value.

Arrow Functions (9:38): A modern, concise syntax for writing functions. Arrow functions are often stored in variables and are highly useful for keeping code clean and passing functions as arguments to other processes.
Function Invocation (11:18): Also known as "calling" a function, this is the act of triggering the code block to execute using its name followed by parentheses.

*/
