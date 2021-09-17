const AWS = require("aws-sdk");
AWS.config.update({ region: 'ap-northeast-1' });
const docClient = new AWS.DynamoDB.DocumentClient();

function checkUser(userId) {
  var user = getUser(userId);
  if(user != []){
    return createUser(userId);
  } else {
    return user;
  }
}

function getUser(userId){
  var params = {
    TableName: "eigamap-bot-registered-users",
    Key: {
      "id": userId
    }
  };
  var res = docClient.get(params, function(err, data){
    if (err) {
      console.error("Unable to get item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Added item:", JSON.stringify(data, null, 2));
    }
  });
  var user = JSON.stringify(res.Item);
  return user;
}

function createUser(userId){
  var params = {
    TableName: "eigamap-bot-registered-users",
    Key: {
      "id": userId
    }
  };
  var res = docClient.put(params, function(err, data){
    if (err) {
      console.error("Unable to set item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Added user:", JSON.stringify(data, null, 2));
    }
  });
  var newUser = JSON.stringify(res.Item);
  return newUser;
}

function updateUser(user){
  var params = {
    TableName: "eigamap-bot-registered-users",
    Key: {
      "id": userId,
      "destination": "",
      "lng": "",
      "lat": "",
      "results": 0,
      "displayResults":0,
      "time": "",
    }
  };
  var res = docClient.update(params, function(err, data){
    if (err) {
      console.error("Unable to set item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Updated user:", JSON.stringify(data, null, 2));
    }
  });
  return res.data;
}

function deleteUser(user){
  var params = {
    TableName: "eigamap-bot-registered-users",
    Key: {
      "id": userId
    }
  };
  var res = docClient.delete(params, function(err, data){
    if (err) {
      console.error("Undelete to set item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Deleted user:", JSON.stringify(data, null, 2));
    }
  });
  return res.data;
}