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
