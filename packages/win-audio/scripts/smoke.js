const audio = require('..');
console.log('win-audio isSupported=', audio.isSupported());
console.log('win-audio host=', audio.resolveHost?.());
process.exit(0);
