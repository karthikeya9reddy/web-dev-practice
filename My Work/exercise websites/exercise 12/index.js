console.log("welcome to ex 12 ")

document.querySelectorAll(".box").forEach(e=>{
    r = Math.floor(Math.random()*256);
    g = Math.floor(Math.random()*256);
    b = Math.floor(Math.random()*256);
    e.style.backgroundColor =`rgb(${r},${g},${b})`;

    r1 = Math.floor(Math.random()*256);
    g2 = Math.floor(Math.random()*256);
    b3 = Math.floor(Math.random()*256);
    e.style.color =`rgb(${r1},${g2},${b3})`;
})

