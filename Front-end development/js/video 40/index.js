let arr = [1, 2, 4, 5, 7]
 // index  0, 1, 2, 3, 4 

 arr[0] = 547874;  // cannot do this in string 
//  console.log(arr, typeof(arr));
//  console.log(arr.length)

//  console.log(arr[0])
//  console.log(arr[2])
//  console.log(arr[4])

console.log(arr.toString())
console.log(arr.join(" and "))
console.log(arr.pop(), arr)
console.log(arr.push(100), arr)
console.log(arr.push("karthik"), arr)
console.log(arr.shift(), arr)
console.log(arr.unshift("jack"), arr)
console.log(delete arr[5], arr)
console.log(arr.length)
// console.log(a[5])  --> cannot print index 5 cus its deleted but memeory is allocated but no value

//concating values in array
let a1 = [1, 2, 3]
let a2 = [4, 5, 6]
let a3 = [7, 8, 9]
console.log(a1.concat(a2,a3))
console.log(a2.concat(a1,a3))

//sorting in array
let a = [7, 9, 8]
console.log(a.sort())


//splice in array
let number = [11, 12, 13, 14, 15]
// console.log(number.splice(1,3), number)
console.log(number.splice(1,3,222,333), number)

//slice in array
let num = [1, 2, 3, 4]
console.log(num.slice(2))
console.log(num.slice(1,3))


/* 
summary of the Video 

Arrays: Used to store multiple values in a single variable. They are mutable, meaning you can change elements by index (e.g., arr[0] = 566).

length: A property that returns the number of elements in an array (0:29).

toString(): Converts an array into a comma-separated string (7:38).

join(separator): Joins array elements into a string using a specified separator (8:13).

pop(): Removes the last element from an array and returns it (9:05).

push(item): Adds a new element to the end of an array (9:52).

shift(): Removes the first element and returns it (10:36).

unshift(item): Adds a new element to the beginning of an array (10:56).

delete: Removes an element but leaves an empty slot (undefined) at that index, keeping the array length the same (11:44).

concat(): Merges two or more arrays into a new one (12:25).

sort(): Sorts the original array in place (12:57).

splice(index, count, items): Removes elements and optionally adds new ones at a specific position (13:42).

slice(start, end): Returns a shallow copy of a portion of an array without modifying the original (15:38).

//important points to remember//

Mutability: Unlike strings, arrays in JavaScript are mutable, meaning you can modify, add, or remove elements directly within the original array.

Length Property: Use arr.length to get the count of items. Note that delete leaves an empty slot (undefined) at an index, but the length remains unchanged (12:03).

Add/Remove Methods:
push() and pop() work on the end of the array.
shift() and unshift() work on the beginning of the array.
Splice vs. Slice:
splice() modifies the original array by removing or adding elements (14:42).
slice() creates a new array copy and does not change the original (15:38).
*/