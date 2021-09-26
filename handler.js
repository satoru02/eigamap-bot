'use strict';

const AWS = require("aws-sdk");
const axios = require('axios');
const linebot = require('linebot');
const fs = require('fs');
const docClient = new AWS.DynamoDB.DocumentClient();
const rawData = fs.readFileSync('geodata.json');
const theaters = JSON.parse(rawData);
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const S3_IMAGE = process.env.S3_IMAGE;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

const bot = linebot({
  channelId: process.env.CHANNEL_ID,
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

const tmdbAxios = axios.create({
  withCredentials: false,
  headers: {
    'Content-Type': 'application/json'
  }
});

AWS.config.update({
  region: 'ap-northeast-1'
});

module.exports.main = async (event) => {
  if (bot.verify(event.body, event.headers["x-line-signature"])) {

    const body = JSON.parse(event.body)["events"][0];
    const replyToken = body.replyToken;
    const userId = body.source.userId;
    let messages = [];

    switch (body.type) {
      case "follow":
        await deleteUser(userId);
        await createUser(userId);

        let welcomeMsg = welcomeMessage();
        let addressMsg = setAddressMessage();

        messages.push(welcomeMsg, addressMsg);
        await replyMessage(replyToken, messages);
        break;
      case "message":
        let res = await getUser(userId);
        let user = JSON.parse(res);
        messages = await setReply(user, body);
        if (messages.length > 0) {
          await replyMessage(replyToken, messages);
        }
        break;
      case "postback":
        if (body.postback.data === 'restart') {
          let keyParams = {
            "user_id": userId,
          };
          let expAtr = resetParams();
          await updateUser(keyParams, expAtr);
          let addressMsg = setAddressMessage();

          messages.push(addressMsg);
          await replyMessage(replyToken, messages);
          break;
        } else {
          let res = await getUser(userId);
          let user = JSON.parse(res);
          let messages = await setReply(user, body);
          if (messages.length > 0) {
            await replyMessage(replyToken, messages);
          }
          break;
        }
        case "unfollow":
          await deleteUser(userId);
          break;
    }
  }
};

async function setReply(user, eventBody) {
  const keyParams = {
    "user_id": user.user_id,
  };
  let messages = [];

  switch (user.situation) {
    case "address":
      let messageType = eventBody.message.type;

      // EX: -> return if use send emoji to bot.
      if (messageType != "text" && messageType != "location") {
        return messages;
      }

      let expAtr = resetParams();
      await updateUser(keyParams, expAtr);
      let location = new Object();
      let searchStatus;
      let destination;

      if (messageType == "text") {
        destination = eventBody.message.text.replace(/\r?\n/g, " ");
        location = await getLocation(destination);
        if (typeof (location) == "object") {
          searchStatus = "OK";
        } else {
          searchStatus = location;
        }
      } else if (messageType == "location") {
        searchStatus = "LINE_LOCATION";
        location.lat = eventBody.message.latitude;
        location.lng = eventBody.message.longitude;
        destination = eventBody.message.address;
      }

      if (searchStatus == "OK" || searchStatus == "LINE_LOCATION") {
        let setTimeMsg = setTimeMessage();
        messages.push(setTimeMsg);

        let expAtr = {
          ":sit": "time",
          ":lng": location.lng,
          ":lat": location.lat,
          ":plc": destination,
          ":dir": 0,
          ":rel": 0,
          ":sct": "",
          ":cur": "",
        };
        await updateUser(keyParams, expAtr);
      } else if (searchStatus == "ZERO_RESULTS") {
        let resetAddMsg = resetAddressMessage();
        messages.push(resetAddMsg);
      } else {
        let errorMsg = resetAddressMessage()
        messages.push(errorMsg);
      }
      break;

    case "time":
    case "searched":
      let nearByTheaters;
      let theatersInfo;
      let moviesInfo;
      let userTime;

      // EX: -> return if use send text to bot.
      if (eventBody.message) {
        let resetTimeMsg = resetTimeMessage();
        messages.push(resetTimeMsg);
        return messages;
      } else if (eventBody.postback.data === "datePick") {
        nearByTheaters = searchTheaters(user.lat, user.lng);
        theatersInfo = [];
        if (nearByTheaters.length > 0) {
          for (let i = 0; i < nearByTheaters.length; i++) {
            let params = {
              TableName: "Cinemas",
              Key: {
                "name": nearByTheaters[i]
              }
            };
            let res = await docClient.get(params).promise();
            theatersInfo.push(JSON.stringify(res.Item));
          }
          moviesInfo = processingInfo(theatersInfo, eventBody.postback.params.time);
          userTime = eventBody.postback.params.time;
          let expAtr = {
            ":sit": "searched",
            ":lng": user.lng,
            ":lat": user.lat,
            ":plc": user.place,
            ":dir": 0,
            ":rel": 0,
            ":sct": eventBody.postback.params.time,
            ":cur": moviesInfo,
          };
          await updateUser(keyParams, expAtr);
        } else {
          let noTheaterMsg = noTheaterMessage();
          let addressMsg = setAddressMessage();
          messages.push(noTheaterMsg, addressMsg);
          let expAtr = resetParams();
          await updateUser(keyParams, expAtr);
          return messages;
        }
      } else if (eventBody.postback.data === "moreResults") {
        moviesInfo = user.currentResults;
        userTime = user.scheduledTime;
      }

      if ((moviesInfo.length > 0) && (moviesInfo.length < 10)) {
        let finishMsg = searchFinishMessage(user.place, userTime, moviesInfo.length);
        let placesMsg = await theatersMessage(moviesInfo);
        messages.push(finishMsg, placesMsg);
        let expAtr = resetParams();
        await updateUser(keyParams, expAtr);
      } else if (moviesInfo.length > 10) {
        let moreRes = user.displayResults + 5;
        let remainInfo = moviesInfo.length - moreRes;
        let finishMsg = searchFinishMessage(user.place, userTime, moviesInfo.length);
        let placesMsg = await theatersMessage(moviesInfo.slice(user.displayResults, moreRes), remainInfo);
        messages.push(finishMsg, placesMsg);
        let expAtr = {
          ":sit": "searched",
          ":lng": user.lng,
          ":lat": user.lat,
          ":plc": user.place,
          ":dir": moreRes,
          ":rel": moviesInfo.length,
          ":sct": userTime,
          ":cur": moviesInfo
        };
        await updateUser(keyParams, expAtr);
      } else {
        let noTheaterMsg = noTheaterMessage();
        messages.push(noTheaterMsg);
        let expAtr = resetParams();
        await updateUser(keyParams, expAtr);
      }
      break;
  }
  return messages;
}

async function replyMessage(replyToken, messages) {
  await bot.reply(replyToken, messages)
    .then(function (data) {
      console.log('Success', data);
    }).catch(function (error) {
      console.log('Error', error);
    });
}

// FIX: -> Process theaters data.
function processingInfo(theatersInfo, time) {
  let moviesInfo = new Array();
  let movieInfo;

  for (let ti = 0; ti < theatersInfo.length; ti++) {
    if (typeof theatersInfo[ti] !== "undefined") {
      let theater = JSON.parse(theatersInfo[ti]);
      for (let ci = 0; ci < theater.cnm_info[0].length; ci++) {
        const targetMovie = theater.cnm_info[0][ci].props[0][0].find((movie) => {
          return movie.time > time;
        });
        if (typeof targetMovie !== "undefined") {
          movieInfo = {
            "mvTheater": theater.name,
            "mvTitle": theater.cnm_info[0][ci].title,
            "mvTime": targetMovie.time
          };
          moviesInfo.push(movieInfo);
        }
      }
    }
  }
  return moviesInfo;
}

async function getLocation(address) {
  let geocodeApiUrl = "https://maps.googleapis.com/maps/api/geocode/json";
  let location = new Object();
  let params = {
    address: address,
    components: {
      country: "ja"
    },
    key: GOOGLE_API_KEY,
  };
  location = await axios.get(geocodeApiUrl, {
      params: params
    })
    .then((res) => {
      location.lat = res.data.results[0].geometry.location.lat;
      location.lng = res.data.results[0].geometry.location.lng;
      return location;
    })
    .catch((err) => {
      console.log(err);
      return "ZERO_RESULTS";
    });
  return location;
}

function searchTheaters(lat, lng) {
  let theaterLists = [];
  const R = Math.PI / 180;
  theaters.features.forEach(theater => {
    let theaterLng = theater.geometry.coordinates[0];
    let theaterLat = theater.geometry.coordinates[1];
    if (getDistance(lat, lng, theaterLat, theaterLng, R) < 10) {
      theaterLists.push(theater.properties.title);
    }
  });
  return theaterLists;
}

// Get distance between user and theaters.
function getDistance(userLat, userLng, theaterLat, theaterLng, radius) {
  userLat *= radius;
  userLng *= radius;
  theaterLat *= radius;
  theaterLng *= radius;
  return 6371 * Math.acos(Math.cos(userLat) * Math.cos(theaterLat) * Math.cos(theaterLng - userLng) + Math.sin(userLat) * Math.sin(theaterLat));
}

// Set theaters flex messages.
async function theatersMessage(moviesInfo, remainInfo) {
  let bubbleList = new Array();

  for (let i = 0; i < moviesInfo.length; i++) {
    let movieImage;
    const image_path = await tmdbAxios.get(encodeURI(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=ja&query=${moviesInfo[i].mvTitle}&page=1&include_adult=false`))
      .then((res) => {
        return res.data.results[0].poster_path;
      })
      .catch((err) => {
        return "ZERO_RESULTS";
      });
    if (image_path !== "ZERO_RESULTS") {
      movieImage = `https://image.tmdb.org/t/p/w500/${image_path}`;
    } else {
      movieImage = S3_IMAGE;
    }
    let bubbleMsg = setBubbleMsg(moviesInfo[i].mvTheater, moviesInfo[i].mvTitle, moviesInfo[i].mvTime, movieImage);
    bubbleList.push(bubbleMsg);
  }

  if (remainInfo > 5) {
    let moreMsg = setMoreMsg();
    bubbleList.push(moreMsg);
  }

  let startMsg = setStartMsg();
  bubbleList.push(startMsg);
  let flexMsg = {
    "type": "flex",
    "altText": "近くの映画上映情報",
    "contents": {
      "type": "carousel",
      "contents": bubbleList
    }
  };
  return flexMsg;
}

function welcomeMessage() {
  let msg = {
    "type": "text",
    "text": "はじめまして$となりの映画館です$" + "\n\n" +
      "お友達登録ありがとうございます$ このアカウントでは、あなたが今いる場所からすぐ行ける映画館の上映情報をピックアップしてお届けします$$" + "\n\n" +
      "今後も、様々な機能を追加していきますので、ご期待ください$$",
    "emojis": [{
        "index": 6,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "043"
      },
      {
        "index": 16,
        "productId": "5ac22bad031a6752fb806d67",
        "emojiId": "105"
      },
      {
        "index": 34,
        "productId": "5ac223c6040ab15980c9b44a",
        "emojiId": "035"
      },
      {
        "index": 85,
        "productId": "5ac21ae3040ab15980c9b440",
        "emojiId": "129"
      },
      {
        "index": 86,
        "productId": "5ac21ae3040ab15980c9b440",
        "emojiId": "129"
      },
      {
        "index": 117,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "028"
      },
      {
        "index": 118,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "028"
      }
    ]
  };
  return msg;
}

function setAddressMessage() {
  let msg = {
    "type": "text",
    "text": "それでは、映画を見たい場所を教えてください$" + "\n\n" +
      "ランドマーク(目印となる場所)の名前でも検索出来ます$" + "\n\n" +
      "現在地の情報は、左下の＋ボタンから「位置情報」を送信すると簡単です！",
    "emojis": [{
        "index": 21,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "023"
      },
      {
        "index": 50,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "111"
      },
    ]
  };
  return msg;
}

function resetAddressMessage() {
  let msg = {
    "type": "text",
    "text": "ごめんなさい！入力してもらった場所の近くに、映画館が見つかりませんでした。目的地の再入力をお願いします$",
    "emojis": [{
      "index": 51,
      "productId": "5ac1bfd5040ab15980c9b435",
      "emojiId": "024"
    }],
  };
  return msg;
}

function setTimeMessage() {
  let msg = {
    "type": "text",
    "text": "何時くらいに観に行きますか？下のボタンから選んでください$",
    "emojis": [{
      "index": 28,
      "productId": "5ac21a18040ab15980c9b43e",
      "emojiId": "190"
    }],
    "quickReply": {
      "items": [{
        "type": "action",
        "action": {
          "type": "datetimepicker",
          "label": "Select date",
          "data": "datePick",
          "mode": "time"
        }
      }]
    }
  };
  return msg;
}

function resetTimeMessage() {
  let msg = {
    "type": "text",
    "text": "ごめんなさい!時間は下のボタンから選んでね。$",
    "emojis": [{
      "index": 22,
      "productId": "5ac21a18040ab15980c9b43e",
      "emojiId": "190"
    }],
    "quickReply": {
      "items": [{
        "type": "action",
        "action": {
          "type": "datetimepicker",
          "label": "Select date",
          "data": "datePick",
          "mode": "time"
        }
      }]
    }
  };
  return msg;
}

function noTheaterMessage() {
  let msg = {
    "type": "text",
    "text": "ごめんなさい！目的の時間と場所からは上映情報が見つかりませんでした$$" + "\n\n" + "場所と時間を変えてみてね!",
    "emojis": [{
        "index": 33,
        "productId": "5ac1bfd5040ab15980c9b435",
        "emojiId": "024"
      },
      {
        "index": 34,
        "productId": "5ac1bfd5040ab15980c9b435",
        "emojiId": "024"
      }
    ],
  };
  return msg;
}

function searchFinishMessage(place, time, searchResults) {
  let msg = {
    "type": "text",
    "text": "お待たせしました！今から行ける映画情報はこちらです$" + "\n\n" +
      "検索場所：" + place + "\n" +
      "目的の時間：" + time + "\n" +
      "検索結果：" + searchResults + "件\n\n" +
      "①検索結果をさらに表示したい場合は、水色のMOREボタンを押してみてください。" + "\n\n" +
      "②目的地を変えて検索したい場合は、ピンク色のRESTARTボタンを押してみてください。",
    "emojis": [{
      "index": 25,
      "productId": "5ac2280f031a6752fb806d65",
      "emojiId": "176"
    }],
  };
  return msg;
}

function setMoreMsg() {
  let moreMsg = {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
          "type": "text",
          "text": "MORE",
          "weight": "bold",
          "size": "5xl",
          "margin": "xxl",
          "offsetTop": "110px",
          "offsetStart": "27px",
          "color": "#ffffff"
        },
        {
          "type": "box",
          "layout": "vertical",
          "margin": "lg",
          "spacing": "sm",
          "contents": [{
            "type": "box",
            "layout": "vertical",
            "contents": []
          }]
        }
      ],
      "height": "400px",
      "margin": "xl",
      "paddingTop": "xxl",
      "backgroundColor": "#00bbf9"
    },
    "footer": {
      "type": "box",
      "layout": "horizontal",
      "spacing": "sm",
      "contents": [{
          "type": "button",
          "height": "sm",
          "action": {
            "type": "postback",
            "label": "他の上映情報を検索",
            "data": "moreResults"
          },
          "color": "#000000"
        },
        {
          "type": "spacer",
          "size": "sm"
        }
      ],
      "flex": 0
    }
  };
  return moreMsg;
}

function setStartMsg() {
  let startMsg = {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
          "type": "text",
          "text": "RESET",
          "weight": "bold",
          "size": "5xl",
          "margin": "xxl",
          "offsetTop": "110px",
          "offsetStart": "27px",
          "color": "#ffffff"
        },
        {
          "type": "box",
          "layout": "vertical",
          "margin": "lg",
          "spacing": "sm",
          "contents": [{
            "type": "box",
            "layout": "vertical",
            "contents": []
          }]
        }
      ],
      "height": "400px",
      "margin": "xl",
      "paddingTop": "xxl",
      "backgroundColor": "#f72585"
    },
    "footer": {
      "type": "box",
      "layout": "horizontal",
      "spacing": "sm",
      "contents": [{
          "type": "button",
          "height": "sm",
          "action": {
            "type": "postback",
            "label": "目的地検索に戻る",
            "data": "restart"
          },
          "color": "#000000"
        },
        {
          "type": "spacer",
          "size": "sm"
        }
      ],
      "flex": 0
    }
  };
  return startMsg;
}

function setBubbleMsg(theaterName, movieName, movieTime, movieImage) {
  let bubbleMsg = {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
          "type": "image",
          "url": movieImage,
          "size": "full",
          "aspectMode": "cover",
          "aspectRatio": "2:3",
          "gravity": "top"
        },
        {
          "type": "box",
          "layout": "vertical",
          "contents": [{
              "type": "box",
              "layout": "vertical",
              "contents": [{
                "type": "text",
                "text": movieName,
                "size": "xxl",
                "color": "#ffffff",
                "weight": "bold",
                "wrap": true
              }]
            },
            {
              "type": "box",
              "layout": "baseline",
              "contents": [{
                "type": "text",
                "text": theaterName,
                "color": "#ffffff",
                "size": "lg",
                "flex": 0,
                "wrap": true
              }],
              "spacing": "lg",
              "margin": "xl"
            },
            {
              "type": "box",
              "layout": "vertical",
              "contents": [{
                  "type": "filler"
                },
                {
                  "type": "box",
                  "layout": "baseline",
                  "contents": [{
                      "type": "filler"
                    },
                    {
                      "type": "text",
                      "text": `${movieTime} 上映開始`,
                      "color": "#ffffff",
                      "flex": 0,
                      "offsetTop": "-2px",
                      "size": "lg",
                      "weight": "bold",
                    },
                    {
                      "type": "filler"
                    }
                  ],
                  "spacing": "sm"
                },
                {
                  "type": "filler"
                }
              ],
              "borderWidth": "1px",
              "cornerRadius": "4px",
              "spacing": "sm",
              "borderColor": "#ffffff",
              "margin": "xxl",
              "height": "40px"
            }
          ],
          "position": "absolute",
          "offsetBottom": "0px",
          "offsetStart": "0px",
          "offsetEnd": "0px",
          "backgroundColor": "#00000Acc",
          "paddingAll": "20px",
          "paddingTop": "18px"
        },
        {
          "type": "box",
          "layout": "vertical",
          "contents": [{
            "type": "text",
            "text": "New",
            "color": "#ffffff",
            "align": "center",
            "size": "xs",
            "offsetTop": "3px"
          }],
          "position": "absolute",
          "cornerRadius": "20px",
          "offsetTop": "18px",
          "backgroundColor": "#ff334b",
          "offsetStart": "18px",
          "height": "25px",
          "width": "53px"
        }
      ],
      "paddingAll": "0px",
      "action": {
        "type": "uri",
        "label": "action",
        "uri": `https://www.google.com/search?q=` + theaterName
      }
    }
  };
  return bubbleMsg;
}

function resetParams() {
  let resetParams = {
    ":sit": "address",
    ":lng": "",
    ":lat": "",
    ":plc": "",
    ":dir": 0,
    ":rel": 0,
    ":sct": "",
    ":cur": "",
  };
  return resetParams;
}

// crud user -------------------------------------------------------------------------------
async function createUser(userId) {
  let params = {
    TableName: "eigabot_users",
    Item: {
      "user_id": userId,
      "situation": "address"
    }
  };
  await docClient.put(params, function (err, data) {
    if (err) {
      console.error("Unable to create user. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Created user:", JSON.stringify(data, null, 2));
    }
  }).promise();
}

async function getUser(userId) {
  let params = {
    TableName: "eigabot_users",
    Key: {
      "user_id": userId
    }
  };
  let res = await docClient.get(params, function (err, data) {
    if (err) {
      console.error("Unable to get user. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Got user:", JSON.stringify(data, null, 2));
    }
  }).promise();
  let user = JSON.stringify(res.Item);
  return user;
}

async function updateUser(keyParams, expAtr) {
  let params = {
    TableName: "eigabot_users",
    Key: keyParams,
    UpdateExpression: "set situation = :sit, lng = :lng, lat = :lat, place = :plc, displayResults = :dir, results = :rel, scheduledTime = :sct, currentResults = :cur",
    ExpressionAttributeValues: expAtr,
    ReturnValues: "UPDATED_NEW"
  };
  let res = await docClient.update(params, function (err, data) {
    if (err) {
      console.error("Unable to update user. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Updated user:", JSON.stringify(data, null, 2));
    }
  }).promise();
  let user = JSON.stringify(res.Item);
  return user;
}

async function deleteUser(userId) {
  let params = {
    TableName: "eigabot_users",
    Key: {
      "user_id": userId
    }
  };
  await docClient.delete(params, function (err, data) {
    if (err) {
      console.error("Undelete to delete user. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Deleted user:", JSON.stringify(data, null, 2));
    }
  }).promise();
}