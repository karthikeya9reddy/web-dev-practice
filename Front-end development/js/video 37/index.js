console.log("i am a tutorial on loops")

let a = 1;

// for (let i = 0; i < 10; i++) {
//     console.log(a + i);
// }

// let obj = {
//     name: "karthik",
//     role: "programmer",
//     company: "codewithharry ai"
// }

// for (const key in obj ){
//     const element = obj[key];
//     console.log(key, element)   
// }

// for (const c of "harry") {
//     console.log(c)
// }

// let i = 0;
// while (i<10){
//     console.log(i)
//     i++;
// }

let i = 10;
do {
    console.log(i)
    i++; 
} while (i<6);

/*
summary of the video 

Types of Loops Explained:
For Loop (03:11): The standard loop used when you know the number of iterations beforehand. It consists of three parts: initialization (e.g., let i = 0), condition (e.g., i < 100), and increment (e.g., i++).

For-In Loop (07:03): Specifically designed to iterate over the keys of an object. It is ideal for accessing properties within an object structure.

For-Of Loop (09:07): Used for iterable data structures like arrays and strings. It allows you to access each value directly rather than dealing with index keys.

While Loop (10:07): A classic loop that continues to run as long as a specified condition remains true. It checks the condition before executing the code block.

Do-While Loop (12:21): Similar to the While loop, but it guarantees the code block runs at least once because the condition is checked after the first execution.


Key Takeaways:
Infinite Loops: The instructor warns to be cautious with loop conditions, as improperly defined logic (like a missing increment or an always-true condition) can cause the program to hang indefinitely (06:47, 11:45).

Best Practices: The tutorial emphasizes that you don't need to memorize the exact syntax for every loop; using tools like VS Code snippets helps, and understanding when to use each type is more important than rote memorization (09:24).
 */


