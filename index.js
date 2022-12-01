// generate a MIDI melody based on a tweet and convert to a wav file

const Twit = require('twitter-v2');
require('dotenv/config')
var config = require('./config.js');
var rita = require('rita');
var midi = require('jsmidgen');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var ffmpegPath = require('@ffmpeg-installer/ffmpeg');
var ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath.path);

// console.log(config);
const bot_username = '@TwittyMIDI';

var bot = new Twit({
  bearer_token: config.bearer_token
});

if (process.env.NODE_ENV == 'develop'){
  require("dotenv").config();
};

var imgFn = path.join(process.cwd(), 'black.jpg');
var midiFn = path.join(process.cwd(), 'output.mid');
var wavFn = path.join(process.cwd(), 'output.wav');
var vidFn = path.join(process.cwd(), 'output.mp4');

function hasNoStopWords(token){
  var stopWords = ['@', 'RT', 'http'];
  return stopWords.every(function(sw){
    return !token.includes(sw);
  });
}

function isNotPunctuation(token){
  return !rita.RiTa.isPunctuation(token);
}

function cleanText(text){
  return text.split(' ').filter(hasNoStopWords).join(' ').trim();
}

function getPartsOfSpeech(text){
  return rita.RiTa.getPosTags(text);
}

// the fun part: mapping parts of speech to notes
function compose(taggedTweet, track){
  var notes = taggedTweet.map(function(tag){
    if (tag.includes('nn') || tag.includes('i')){
      return 'eb4';
    }
    if (tag.includes('vb')){
      return 'g4';
    }
    if (tag.includes('adv')){
      'return ab4';
    }
    if (tag.includes('adj')){
      return 'd4';
    }
    return 'c4';
  });
  notes.forEach(function(note){
    // quarter notes
    track.addNote(0, note, 128);
  });
  return track;
}

function createMidi(tweet, midiFn, cb){
  var file = new midi.File();
  var track = new midi.Track();
  file.addTrack(track);
  var cleanedText = rita.RiTa.tokenize(cleanText(tweet.text)).filter(isNotPunctuation);
  var taggedTweet = getPartsOfSpeech(cleanedText);
  compose(TaggedTweet, track);
  fs.writeFile(midiFn, file.toBytes(), {encoding: 'binary'}, cb);
}

function convertMidiToWav(midiFn, wavFn, cb){
  var command = 'timidity --output-24bit -A120 ' + midiFn + ' -0w -o ' + wavFn;
  child_process.exec(command, {}, function(err, stdout, stderr){
    if (err) {
      cb(err);
    } else {
      cb(null);
    }
  })
}

function createVideo(imgFn, wavFn, vidFn, cb){
  ffmpeg()
    .on('end', function(){
      cb(null);
    })
    .on('error', function(err, stdout, stderr){
      cb(err);
    })
    .input(imgFn)
    .inputFPS(1/6)
    .input(wavFn)
    .output(vidFn)
    .outputFPS(30)
    .run()
}

function createMedia(tweet, imgFn, midiFn, wavFn, vidFn, cb){
  createMidi(tweet, midiFn, function(err, result){
    if (err) {
      console.log(err);
    } else {
      // convert midi
      convertMidiToWav(midiFn, wavFn, function(err){
        if (err) {
          console.log(err);
        } else {
          console.log('midi converted!');
          createVideo(imgFn, wavFn, vidFn, cb);
        }
      })
    }
  });
}

function deleteWav(wavFn, cb){
  var command = 'rm ' + wavFn;
  child_process.exec(command, {}, function(err, stdout, stderr){
    if (err) {
      cb(err);
    } else {
      cb(null);
    }
  });
}

function postStatus(params){
  bot.post('statuses/update', params, function(err, data, response){
    if (err){
      console.log(err);
    } else {
      
    }
  })
}

function uploadMedia(tweet, vidFn){
  bot.postMediaChunked({file_path: vidFn}, function(err, data, response){
    if (err){
      console.log(err);
    } else {
      var stat = tweet.text.split(bot_username).join(' ').trim();
      var params = {
        status: '@' + tweet.user.screen_name + ' ' + stat,
        in_reply_to_status_id: tweet.id_str,
        media_ids: data.media_id_string
      }
      postStatus(params);
    }
  });
}

async function listenForever(streamFactory, dataConsumer) {
  try {
    for await (const { data } of streamFactory()) {
      dataConsumer(data);
    }
    
    console.log('Stream disconnected without error. Reconnecting.');
    listenForever(streamFactory, dataConsumer);
  } catch (err) {
    console.warn('Stream disconnected with error. Retrying.', err);
    listenForever(streamFactory, dataConsumer);
  }
}

async function setup () {
  const endpointParameters = {
    'tweet.fields': [ 'author_id', 'conversation_id' ],
    'expansions': [ 'author_id', 'referenced_tweets.id' ],
    'media.fields': [ 'url' ]
  }
  try {
    console.log('Setting up Twitter...');
    const body = {
      'add': [
        { 'value': 'to:' + bot_username }
      ]
    }
    const r = await Twit.post('tweets/search/stream/rules', body);
    console.log(r);
  } catch (err) {
    console.log(err);
  }
  
  listenForever(
    () => T.stream('tweets/search/stream', endpointParameters),
    (data) => createMedia(data, imgFn, midiFn, wavFn, vidFn, function(err){
      if (err){
        console.log(err);
      } else {
        console.log('video created!');
        deleteWav(wavFn, function(err){
          if (err){
            console.log(err);
          } else {
            uploadMedia(tweet, vidFn);
          }
        })
      }
    })
  );
  
  
}

/* var stream = bot.stream('statuses/filter', {track: bot_username});

stream.on('connecting', function(response){
  console.log('connecting...');
});

stream.on('connected', function(response){
  console.log('connected!');
});

stream.on('error', function(err){
  console.log(err);
});

stream.on('tweet', function(tweet){
  if (tweet.text.length > 0){
    createMedia(tweet, imgFn, midiFn, wavFn, vidFn, function(err){
      if (err){
        console.log(err);
      } else {
        console.log('video created!');
        deleteWav(wavFn, function(err){
          if (err){
            console.log(err);
          } else {
            uploadMedia(tweet, vidFn);
          }
        })
      }
    })
  }
}) */

