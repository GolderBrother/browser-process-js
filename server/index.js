const express = require('express');
const app = express();

/* app.use(function (req, res, next) {
    console.log(req.url);
    if (req.url === '/hello.css') {
        setTimeout(next, 1000)
    } else if (req.url === '/hello.js') {
        setTimeout(next, 2000)
    } else {
        next();
    }
}); */

app.use(express.static('public'));

app.listen(80, () => {
    console.log('server started at 80');
});