console.log("hello i am conditional tutorial")

let age = 1;
// let grace = 2;

// //Arthmetic operators
// console.log(age + grace)
// console.log(age - grace)
// console.log(age * grace)
// console.log(age / grace)
// console.log(age ** grace) //---> exponential operator
// console.log(age % grace)  //---> moduls operator

// assignment operators
// age = grace;
// age += grace;
// age -= grace;
// age *= grace;
// age /= grace;
// age %= grace;
// age **= grace;
// console.log(age)

// comparison operators
// == equal to 
// != not equal 
// === equal value and type 
// !== not equal value or not equal type 
// > greater than 
// < less than 
// >= greater than or equal to 
// <= less than or equal to 
// ? : ternary operators or short hand if else operators

// logical operators
// && logical and 
// || logical or 
// ! logical not

if(age == 18){
    console.log("you can drive");
}

else if(age == 0){
    console.log("are you kidding?")
}

else if(age == 1){
    console.log("are you again kidding?")
}

else{
    console.log("you cannot drive ")
}


a = 6;
b = 8;
let c = a > b ? (a -b ) : (b - a);

/*
the above code translate to:

if(a>b){
   let c = a - b;
}
else{
    let c = b - a;    
}
*/



/*
summary of the video 

1. Operators
Arithmetic Operators: Includes standard math operations (+, -, *, /) and the exponentiation operator (**) for calculating powers (5:54).

Modulus Operator (%): Returns the remainder of a division operation (6:12).

Assignment Operators: Used to update variables, such as +=, -=, etc. (6:38).

Comparison Operators: Used to evaluate conditions as true or false.
== (Equal to): Compares values (8:04).
=== (Strict equal to): Compares both value and data type (10:36).
!= / !==: Check for inequality (9:40, 12:02).

Logical Operators: Used to combine conditions: && (AND), || (OR), and ! (NOT) (12:17).


2. Conditionals
If-Else Statement: A basic control structure where a block of code executes if the condition is true, otherwise the else block runs (2:45).

If-Else Ladder: A chain of multiple if, else if, and else statements used to handle multiple conditions sequentially (16:26).

Ternary Operator: A shorthand way to write an if-else statement in a single line using the syntax condition ? expressionIfTrue : expressionIfFalse (20:02).


3. Additional Concepts
Comments: Used to ignore code during execution. Single-line (//) and multi-line ('/* ...* /) comments are explained (14:45).
Development Environment: The video demonstrates using VS Code with the Code Runner extension to run JavaScript files directly in the terminal (0:32).  
*/