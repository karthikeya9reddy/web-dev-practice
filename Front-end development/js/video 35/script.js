console.log("hey this is tutorial 55")

// var a = 5;
// a = a+1;
// var b = 6;
// var c = "karthik";
// var _a = "harry";

let a = 5;
// a = a+1;
let b = 6;
let c = "karthik";
let _a = "harry";
// var 55a = "rohan" --> invalid cus var cannot be number.

// console.log("the sum is " + (a + b + 11))
// console.log(typeof a, typeof b, typeof c)

{
    let a = 66;
    console.log(a)
}
console.log(a)

//const a1 = 6;
// a1 = a1 + 1; not valid cus variable is constant.

//primitive datatypes
let x = "harry bhai";
let y = 22;
let z = 3.55;
const p = true;
let q = undefined;
let r = null;

console.log(x, y, z, p, q, r)
console.log(typeof x, typeof y, typeof z, typeof p, typeof q, typeof r)

// objects
let o = {
    "name": "harry",
    "job code": 5600,
    "is handsome" : true
}
console.log(o);
o.salary = "100crores";
console.log(o);
o.salary = "500crores";
console.log(o);


// summary of the video 

// 1. Variables
// Variables are containers used to store data values (0:02:03).

// Rules for Naming: Names can include letters, digits, underscores, and dollar signs, but cannot start with a digit (0:06:30). Variable names are case-sensitive (0:07:11).

// 2. Declaration Keywords
// var: Used in older JavaScript; it is globally scoped (0:07:30).
// let: The modern standard for declaring variables; it is block-scoped, meaning it only exists within the specific block (e.g., {...}) where it is defined (0:07:37).
// const: Used for values that should not be reassigned. Attempting to change a const variable will result in an error (0:07:30).

// 3. Primitive Data Types
// These represent single, immutable values (0:12:10):

// String: A sequence of characters wrapped in quotes (e.g., "Harry") (0:04:42).
// Number: Includes integers and floating-point numbers (e.g., 5, 3.55) (0:04:36).
// Boolean: Represents logical values: true or false (0:13:05).
// Undefined: A variable declared without an assigned value (0:13:00).
// Null: Represents the intentional absence of any value. Note: typeof null returns 'object', which is considered a long-standing historical error in JavaScript (0:15:19).
// BigInt: Used for extremely large integers (0:13:07).
// Symbol: Used for unique identifiers (0:12:28).

// 4. Objects
// Objects: Collections of key-value pairs used to store more complex data entities. You can create an object using curly braces {} and add or update properties dynamically (0:16:15).
// Typeof Operator: A built-in operator used to determine the data type of a variable or expression (0:04:58).