# ZorkScript
The unofficial JavaScript (subset) to [Z-machine](https://en.wikipedia.org/wiki/Z-machine) compiler.

# Installation
Using npm
```
npm i -g npm
npm i -g zorkscript
```

# Usage
Invoke the compiler from the command line...
```
zsc in.js --out out.z3
```
...and run the output in an appropriate Z-Machine intepreter, such as [Frotz](https://github.com/DavidGriffith/frotz).  Binaries are available for ([Windows](http://www.davidkinder.co.uk/frotz.html), [iPhone](https://itunes.apple.com/us/app/frotz/id287653015?mt=8), [Ubuntu](http://manpages.ubuntu.com/manpages/wily/man6/frotz.6.html), [etc](http://www.ifarchive.org/if-archive/infocom/interpreters/frotz/))

# Example
An example 
```javascript
const max = 50;
const sieve = Array(51);

// https://en.wikipedia.org/wiki/Sieve_of_Eratosthenes
function printPrimes() {
    for (let i = 2; i <= max; ++i) {
        const isMarked = loadb(sieve, i);
        if (isMarked != true) {
            print(' '); print(i);
            for (let j = i * 2; j <= max; j += i) {
                storeb(sieve, j, 1);
            }
        }
    }
}

print('primes: '); printPrimes(); print('\n');
```