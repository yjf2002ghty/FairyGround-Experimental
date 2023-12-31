# FairyGround Experimental

This is an experimental version of FairyGround (See [https://github.com/ianfab/fairyground](https://github.com/ianfab/fairyground)) with new features added. It is a simple demo and playground for [Fairy-Stockfish](https://github.com/ianfab/Fairy-Stockfish) in the browser, using its [WebAssembly port](https://github.com/ianfab/fairy-stockfish.wasm), its [ffish.js](https://www.npmjs.com/package/ffish-es6) library, and the graphical [chessgroundx](https://github.com/gbtami/chessgroundx) library. It is based on the [demo for Fairy-Stockfish WASM](https://github.com/ianfab/fairy-stockfish-nnue-wasm-demo) and [ffish-test](https://github.com/thearst3rd/ffish-test).

You can see it deployed at: [https://fairy-ground-experimental.vercel.app/](https://fairy-ground-experimental.vercel.app/)
(This version does not support binary engine loading feature. To enable it, see step 5 below.)

## Usage (Unix-like system installation)

Same as [https://github.com/ianfab/fairyground](https://github.com/ianfab/fairyground)

## Usage (Windows installation)

Lines start with # or :: are comments, where # used for Bash and :: used for CMD. Do not enter them into your console.

1. Install Node.js at

https://nodejs.org/

2. Check Node.js installation by:
```bash
# Expect to return version information. Otherwise check your installation. (Bash or CMD)
node -v
```

3. Install dependencies
Switch the current directory to the root folder of FairyGround which contains files like "LICENSE" and folders like "public":
```bash
# Bash version
cd <FairyGround root folder path>

:: CMD Version
cd /D <FairyGround root folder path>
```
Then enter: 

```bash
# Bash or CMD
npm install
```

The installation progress may take long time. If it keeps downloading for a long time, you might have some issues on network.

4. Bundle JavaScript to make webpage work

```bash
# If you are user that don't change the code, run command below (Bash)
npm run build

# Else if you are the developer that wants to change the code and immediately see changes in your browser, run command below (Bash)
npm run watch-build
```

If you are using CMD instead of Bash, 
```batch
:: If you are user that don't change the code, run command below (CMD)
npm run buildwithcmd

:: Else if you are the developer that wants to change the code and immediately see changes in your browser, run command below (CMD)
npm run watch-build
```


5. Start server
Start without binary engine loading feature:

```bash
# Bash or CMD
npm run serve
```

Start with binary engine loading feature:

```bash
# Bash or CMD
node server.js
```

Then, browse to http://localhost:5000/

Enjoy!

# Attribution

See [COPYING.md](COPYING.md)
