const AWS = require("aws-sdk");
AWS.config.update({ region: 'ap-northeast-1' });
const docClient = new AWS.DynamoDB.DocumentClient();

// CRUD USER by invoked
module.exports.manageUser = async (event,context) => {
  switch(crud){
    case "create":
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
      break;
    case "get":
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
    case "delete":
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
    break;
    case "update":
      var params = {
        TableName: "eigabot_users",
        Key: keyParams,
        UpdateExpression: "set situation = :sit, lng = :lng, lat = :lat, place = :plc, displayResults = :dir, results = :rel, scheduledTime = :sct, currentResults = :cur",
        ExpressionAttributeValues: expAtr,
        ReturnValues: "UPDATED_NEW"
      };
      var res = await docClient.update(params, function (err, data) {
        if (err) {
          console.error("Unable to update user. Error JSON:", JSON.stringify(err, null, 2));
        } else {
          console.log("Updated user:", JSON.stringify(data, null, 2));
        }
      }).promise();
      var user = JSON.stringify(res.Item);
      return user;
    break;
  }
}