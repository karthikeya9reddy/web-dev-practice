let a = Number(prompt("Enter the value of factorial"));

function factorialReduce(n) {
    // Edge case: Handle 0! or negative numbers safely
    if (n <= 1) return 1;

    // 1. Create the array street: e.g., if n=4, creates [1, 2, 3, 4]
    let numbers = Array.from({ length: n }, (val, index) => index + 1);

    // 2. Reduce the array down to a single number
    return numbers.reduce((accumulator, currentValue) => {
        return accumulator * currentValue; // <--- Your line!
    }, 1); // <--- Starts the accumulator at 1
}

alert("The result of the factorial of " + a + " is " + factorialReduce(a));