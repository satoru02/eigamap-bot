  function welcomeMessage() {
    var msg = {
      "type": "text",
      "text": "友だち登録ありがとうございます" + EMOJI_HAPPY + "\n\n"
    };
    return msg;
  }

  function setAddressMessage() {
    var msg = {
      "type": "text",
      "text": "それでは、お店を調べたい場所の「住所」を教えてね！\n\n"
    };
    return msg;
  }

  function setTimeMessage() {
    var text = {
      "type": "text",
      "text": "何時くらいに観に行きますか？\n\n"
    };
    return text;
  }

  function resetAddressMessage() {
    var text = {
      "type": "text",
      "text": "ごめんなさい！目的地の再入力をお願いします。\n"
    };
    return text;
  }

  function noTheaterMessage(row) {
    return msg;
  }

  function searchFinishMessage(row) {
    return msg;
  }

  function placesMessage(row) {
    return msg;
  }

  function googleErrorMessage(row) {
    return msg;
  }