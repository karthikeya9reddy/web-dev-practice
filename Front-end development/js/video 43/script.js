console.log("karthik")


// Class selector
// let boxes = document.getElementsByClassName("box")
// console.log(boxes)
// boxes[2].style.backgroundColor = "red"


// Id selector
// document.getElementById("red").style.backgroundColor = "red"


//query selector
// document.querySelector(".box").style.backgroundColor = "green"  --> for only 1st element with class box

document.querySelectorAll(".box").forEach(e=>{
    e.style.backgroundColor = "green"
})

/*
summary of the video 

getElementById: Targets a specific element using its unique id attribute. This is the most efficient method for selecting a single, specific element (5:23).

getElementsByClassName: Returns a collection of all elements that share a specific class name. Note that this returns an HTMLCollection, which acts similarly to an array (3:06).

getElementsByTagName: Selects all elements based on their tag name (e.g., , ``). Like the class selector, it returns an HTMLCollection (12:15).


Advanced Selection Methods
querySelector: Allows you to use CSS selectors (like .class or #id) to find the first matching element in the document (7:59).

querySelectorAll: Similar to querySelector, but it returns all matching elements as a NodeList. Because it is a NodeList, you can use the forEach method to iterate over these elements to apply styles or changes (9:05).


Element Comparison and Navigation Methods
matches: Checks if an element matches a specific CSS selector. It returns true or false (13:20).

closest: Searches for the nearest ancestor element (including the element itself) that matches the provided CSS selector. If no match is found, it returns null (14:15).

contains: A boolean method that checks if a specified element is a descendant (or the same as) the element you are calling the method on (15:16).
*/