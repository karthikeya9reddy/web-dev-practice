console.log("this is strings tutorial")

let a = "harry"
console.log(a[0]);
console.log(a[1]);
console.log(a[2]);
console.log(a[3]);
console.log(a[4]);

console.log(a.length) // --> tells length of string

let real_name ="karthik"
let friend = "rohan"
console.log("his name is " + real_name + " and his friends name is " + friend)
// template laterals
console.log(`his name is ${real_name} and his friend name is ${friend} `)

/* 
to add ' in string --> "roh'an"
to add " in string --> `roh"an` or "roh\"an"

\n ---> use for a newline
\t ---> use for a tab
\r ---> use for a carriage return
*/

let b = "Shivam"
console.log(b.toUpperCase())
console.log(b.toLowerCase())
console.log(b.length)
console.log(b.slice(1, 5))
console.log(b.slice(1))
console.log(b.replace("am", "udu"))
console.log(b.concat(a, "aishwariya", "ramesh"))
console.log(b.charAt(3))
console.log(b.indexOf("a"))
console.log(b.startsWith("Sh"))
console.log(b.endsWith("am"))

/* 
summary of the video 

Strings Basics: Strings are created using double or single quotes. You can access individual characters using bracket notation (e.g., a[0]) based on zero-based indexing (02:07).

String Length: The .length property allows you to determine the number of characters in a string (03:47).

Template Literals: Using backticks (`) allows for string interpolation, enabling you to embed variables directly into strings using ${variable} syntax. This makes building complex strings much cleaner than using concatenation (04:02).

Escape Sequences: Special characters can be included in strings using a backslash, such as \n for a new line or \" to include quotes (08:04).

String Methods:
Case Conversion: .toUpperCase() and .toLowerCase() transform the string's casing (08:04).

Slicing: .slice(start, end) extracts a portion of the string (10:26).
Replacement: .replace(target, replacement) finds and replaces the first occurrence of a substring (11:31).

Concatenation: You can join strings using the .concat() method or the + operator (12:16).

Trimming: .trim() is used to remove whitespace from both ends of a string (13:33).

Immutability: A crucial concept in JavaScript is that strings are immutable. You cannot change an existing string; you must create a new one using methods like those mentioned above (13:44).

Exploring Methods: The video encourages developers to use the console to explore available string methods, such as .charAt(), .includes(), .startsWith(), and .endsWith() (15:04).
*/


