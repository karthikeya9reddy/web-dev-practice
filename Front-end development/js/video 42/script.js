console.log("hello world")


document.body.firstElementChild 
document.body.firstElementChild.childNodes 
document.body.firstElementChild.children

/*
summary of the video 

Child Nodes (childNodes): Returns a collection of all child nodes of an element, including text nodes (which account for whitespace and newlines) and comment nodes (3:11, 4:35).

First/Last Child (firstChild / lastChild): Accesses the very first or last node within an element. Often returns a text node due to whitespace (5:41, 6:45).

First/Last Element Child (firstElementChild / lastElementChild): A more precise method that ignores text/comment nodes and returns only the first or last HTML element (7:25, 8:20).

Parent Element (parentElement): Allows you to navigate upwards in the DOM tree from a specific element to find its direct container (9:40).

Children (children): Returns only the HTML elements within a node, filtering out text and comments automatically (10:15, 12:31).

Next/Previous Element Sibling (nextElementSibling / previousElementSibling): Navigates to the adjacent element at the same hierarchy level (9:57, 14:00).
 
Table Navigation (rows): Specific properties available on HTML elements to easily access rows (e.g., table.rows) instead of manual node traversal (15:51).

Key Takeaways:
DOM Hierarchy: Everything in the DOM is a node, but only tags are elements. Using methods like children or firstElementChild is generally preferred over childNodes when you only want to interact with HTML tags.

No Memorization Needed: The instructor emphasizes that these methods do not need to be memorized by heart, as modern code editors (IDEs) will provide suggestions as you type (17:07, 17:35).

Best Practice: Always look for whitespace-related text nodes when using generic methods like childNodes or firstChild, as they can cause unexpected results in your logic (6:12, 15:09).
*/