module.exports.setMessage = async (event) => {
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
        "paddingAll": "0px"
      }
    };
    return bubbleMsg;
  }
}