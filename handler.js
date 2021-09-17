'use strict';

const linebot = require('linebot');
const axios = require('axios');
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const googleKey = process.env.GOOGLE_API_KEY;
const bot = linebot({
  channelId: process.env.CHANNEL_ID,
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

AWS.config.update({
  region: 'ap-northeast-1'
});

module.exports.main = async (event) => {
  if (bot.verify(event.body, event.headers["x-line-signature"])) {
    var body = JSON.parse(event.body)["events"][0];
    var replyToken = body.replyToken;
    var userId = body.source.userId;
    var messages = [];
    switch (body.type) {
      case "follow":
        await deleteUser(userId);
        await createUser(userId);
        var welcomeMsg = welcomeMessage();
        var addressMsg = setAddressMessage();
        messages.push(welcomeMsg, addressMsg);
        await replyMessage(replyToken, messages);
        break;
      case "message":
        var res = await getUser(userId);
        var user = JSON.parse(res);
        var messages = await setReply(user, body);
        if (messages.length > 0) {
          await replyMessage(replyToken, messages);
        }
        break;
      case "unfollow":
        break;
      case "postback":
        break;
    }
  }

  async function setReply(user, eventBody) {
    var messages = [];
    var messageType = eventBody.message.type;
    switch (user.situation) {
      case "address":
        if (messageType != "text" && messageType != "location") {
          return messages;
        }
        
        var keyParams = {
          "user_id": user.user_id,
        }

        var expAtr = {
          ":sit": "address",
          ":lng": "",
          ":lat": "",
          ":plc": "",
          ":dir": 0,
          ":rel": 0
        }
        await updateUser(keyParams, expAtr);

        var location = new Object();
        var searchStatus;
        var destination;
        if (messageType == "text") {
          destination = eventBody.message.text.replace(/\r?\n/g, " ");
          location = await getLocation(destination);
          if (typeof (location) == "object") {
            destination = location;
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
          var keyParams = {
            "user_id": user.user_id,
          }
          var expAtr = {
            ":sit": "time",
            ":lng": location.lng,
            ":lat": location.lat,
            ":plc": destination,
            ":dir": 0,
            ":rel": 0
          }
          await updateUser(keyParams, expAtr);
          var setTimeMsg = setTimeMessage();
          messages.push(setTimeMsg);
        } else if (searchStatus == "ZERO_RESULTS") {
          var resetAddMsg = resetAddressMessage();
          messages.push(resetAddMsg);
        } else {
          var errorMsg = googleErrorMessage("geocoding API", searchStatus);
          messages.push(errorMsg);
        }
        break;
        // ここでcnmDBを叩く。
        // 時間をテキストで受けるかquickReplayで受けるか？
        // ①すでに保存したuserの地理情報から、近くの映画館取得
        // ②目的地の映画館の上映時間から、指定された時間からキュレーション
        // case "time":
        // case "searched":
        //   if (messageType != "text"){
        //     return messages;
        //   }
        //   var time = eventBody.message.text;
        //   time = time.replace(/\r?\n/g, " ");
        //   time = time.trim();
        //   if(time == "なし"){
        //     time = "";
        //   }
        //   // ユーザ情報の検索結果クリア
        //   // clearSearchResult(userRow);
        //   // ユーザ情報に目的時間を保存
        //   // setSearchKeyword(userRow, time);
        //   // ユーザーの地理からcnmDBから映画館取得
        //   var placeList = new Array();
        //   var ret1 = getPlace(location.lat,location.lng,keyword);
        //   if(typeof(ret1) == "object"){
        //     placeList = ret1;
        //     searchStatus = "OK";
        //   } else {
        //     searchStatus = ret1;
        //   }
        //   if(searchStatus == "OK"){
        //     setSearchResult(userRow, placeList);
        //     setUserStatus(userRow, "searched");
        //     var msg1 = searchFinishMessage(userRow);
        //     messages.push(msg1);
        //     var msg2 = placesMessage(userRow);
        //     messages.push(msg2);
        //   } else if(searchStatus == "ZERO_RESULTS") {
        //     var msg1 = noTheaterMessage(userRow);
        //     messages.push(msg1);
        //     //最初に戻る
        //     setUserStatus(userRow, "address");
        //   } else {
        //      var msg1 = googleErrorMessage("【Places API】", searchStatus);
        //      messages.push(msg1);
        //     //最初に戻る
        //      setUserStatus(userRow, "address");
        //   }
        //   break;
    }
    return messages;
  }
};

async function getLocation(address) {
  var params = {
    address: address,
    components: {
      country: "ja"
    },
    key: googleKey,
  };
  var geocodeApiUrl = "https://maps.googleapis.com/maps/api/geocode/json";
  var location = new Object();

  await axios.get(geocodeApiUrl, {
      params: params
    })
    .then((res) => {
      location.lat = res.data.results[0].geometry.location.lat;
      location.lng = res.data.results[0].geometry.location.lng;
      return location;
    })
    .catch((err) => {
      console.log(err)
      return "ZERO_RESULTS";
    });
    return location;
}

function welcomeMessage() {
  var msg = {
    "type": "text",
    "text": "友だち登録ありがとうございます"
  };
  return msg;
}

function setAddressMessage() {
  var msg = {
    "type": "text",
    "text": "それでは、お店を調べたい場所の「住所」を教えてね！"
  };
  return msg;
}

function resetAddressMessage() {
  var text = {
    "type": "text",
    "text": "ごめんなさい！目的地の再入力をお願いします。"
  };
  return text;
}

function setTimeMessage() {
  var text = {
    "type": "text",
    "text": "何時くらいに観に行きますか？"
  };
  return text;
}

// function noTheaterMessage(row) {
//   return msg;
// }

// function searchFinishMessage(row) {
//   return msg;
// }

// function placesMessage(row) {
//   return msg;
// }

function googleErrorMessage(row) {}

async function replyMessage(replyToken, messages) {
  await bot.reply(replyToken, messages)
    .then(function (data) {
      console.log('Success', data);
    }).catch(function (error) {
      console.log('Error', error);
    });
}

async function createUser(userId) {
  var params = {
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
  var params = {
    TableName: "eigabot_users",
    Key: {
      "user_id": userId
    }
  };
  var res = await docClient.get(params, function (err, data) {
    if (err) {
      console.error("Unable to get user. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Got user:", JSON.stringify(data, null, 2));
    }
  }).promise();
  var user = JSON.stringify(res.Item);
  return user;
}

async function updateUser(keyParams, expAtr) {
  var params = {
    TableName: "eigabot_users",
    Key: keyParams,
    UpdateExpression: "set situation = :sit, lng = :lng, lat = :lat, place = :plc, displayResults = :dir, results = :rel",
    ExpressionAttributeValues: expAtr,
    ReturnValues:"UPDATED_NEW"
  };
  await docClient.update(params, function (err, data) {
    if (err) {
      console.error("Unable to update user. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Updated user:", JSON.stringify(data, null, 2));
    }
  }).promise();
}

async function deleteUser(userId) {
  var params = {
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