let a = [1, 93, 5, 6, 88]
/*
for (let index = 0; index < a.length; index++) {
    const element = a[index];
    console.log(index, element)
}
*/


/* foreach loop example
a.forEach((value, index, a) => {
    console.log(value, index, a)
});
*/


 
/* for in loop example
let object = {
//key:  element
    a:   1,
    b:   2, 
    c:   3
}

for (const key in object) {
    if (!Object.hasOwn(object, key)) continue;
    
    const element = object[key];
    console.log(key, element)
}
*/


/*for of loop example
for (const value of a) {
    console.log(value)
}*/


/*
summary of the video 

for loop: A standard loop used to iterate through array indices (17:35).

forEach: A method that executes a provided function for each array element (18:13).

for...in: Used primarily for iterating over the keys (properties) of an object (19:16).

for...of: A modern way to iterate directly over the values of an array (20:44)

//important points to remember//

Classical for Loop: Best for having full control over the index (17:35).

forEach: A functional approach to execute a callback for every element. It provides access to the value, index, and the array itself (18:13).

for...in vs. for...of:
for...in is typically used to iterate over keys or properties of an object (19:16).
for...of is a modern, clean way to iterate directly over the values of an array (20:44).
*/