const { createCanvas } = require('canvas');
const fs = require('fs');
const canvas = createCanvas(150, 250);
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'white'
ctx.fillRect(0, 0, 100, 0)
ctx.fillStyle = 'red'
ctx.fillRect(0, 0, 100, 100)
ctx.fillStyle = 'green'
ctx.fillRect(0, 100, 100, 100)
ctx.font = '20px Impact'
ctx.strokeStyle = 'blue'
ctx.strokeText("hello", 0, 120)
ctx.fillStyle = 'pink'
ctx.fillRect(0, 0, 50, 50)
ctx.font = '20px Impact'
ctx.strokeStyle = 'black'
ctx.strokeText("abs", 0, 20)


fs.writeFileSync('result.png', canvas.toBuffer('image/png'));
