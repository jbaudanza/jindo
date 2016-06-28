./node_modules/browserify/bin/cmd.js js/client/index.js -t [ babelify --presets [ react es2015 ] ] -o public/jindo.js
./node_modules/browserify/bin/cmd.js js/client/landing.js -t [ babelify --presets [ react es2015 ] ] -o public/landing.js
./node_modules/browserify/bin/cmd.js js/chat/index.js  -t [ babelify --presets [ react es2015 ] ] -o public/chat.js