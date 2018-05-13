const fs = require('fs');
const Pattr = require('./Pattr');

// Load program
const program = fs.readFileSync(process.argv[2], 'utf8');
const interpreter = new Pattr(program);

var start = new Date();

interpreter.run();

var end = new Date() - start;
console.info("Execution time: %dms", end);
