./node_modules/browserify/bin/cmd.js js/client/index.js -o public/client.js
./node_modules/browserify/bin/cmd.js js/client/landing.js -t [ babelify --presets [ react ] ] -o public/landing.js
./node_modules/browserify/bin/cmd.js js/chat/index.js  -t [ babelify --presets [ react ] ] -o public/chat.js