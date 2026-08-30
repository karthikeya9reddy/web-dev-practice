let arr = [1, 13, 5, 7, 11];
/*let newarr = []
for (let index = 0; index < arr.length; index++) {
    const element = arr[index];
    newarr.push(element**2)
    
}*/

let newarr = arr.map((e, index, arr)=>{
       return e**2;
})
console.log(newarr)


const greaterthenseven = (e)=>{
    if(e>=7){
        return true
    }
    return false
}
console.log(arr.filter(greaterthenseven))



let arr2 = [1,2,3,4,5,6]
const red = (a,b)=>{
    return a+b;
}
console.log(arr2.reduce(red))

/*
summary of the video

map(): Creates a new array by applying a function to every element of the original array (22:29).

filter(): Creates a new array with all elements that pass a test (predicate function) (24:36).

reduce(): Reduces an array to a single value by executing a reducer function on each element (26:59).

Array.from(): Creates a new array from an iterable object, like a string (29:25).

//important points to remember//

map(): Use this when you want to create a new array by transforming every element of the original (23:29).

filter(): Use this to create a new array containing only elements that pass a specific condition (test) (24:36).

reduce(): Use this to process an array down to a single value (like a sum or product) by applying a function cumulatively (26:59).

Array.from(): Useful for creating an array from other iterable objects, such as converting a string into an array of characters (29:25).

*/