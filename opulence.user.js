// ==UserScript==
// @name        Opulence
// @author      feildmaster
// @description Modifications and Additions to the browser game Prosperity
// @namespace   https://feildmaster.com/
// @version     0.1
// @include       http://www.prosperity.ga/
// @source      https://github.com/feildmaster/Opulence
// @copyright   2015+, feildmaster
// @grant       none
// ==/UserScript==

// Pollyfill start
if (!String.format) {
  String.format = function(format) {
    var args = Array.prototype.slice.call(arguments, 1);
    return format.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] !== 'undefined' ? args[number] : match;
    });
  };
}
// Pollyfill end

// TODO: Be more "angular"   
// ApplicationConfiguration.registerModule('Opulence');
// angular.module("Opulence").service("ChatPlus", ['Chat']);

var root = angular.element(document.body).injector().get('$rootScope'),
    chatModule = angular.element(document).injector().get("Chat"),
    gameModule = angular.element(document).injector().get("Game"),
    friends = {
        /*name: true || false*/
    },
    addFriend = function (name) {
        friends[name] = true;
        return Object.keys(friends).length;
    },
    delFriend = function (name) {
        delete friends[name];
        return Object.keys(friends).length;
    },
    originalConnect = chatModule.connect,
    originalSend = chatModule.send,
    originalSave = gameModule.save,
    originalLoad = gameModule.init,
    initialized = false,
    oldUsers = [],
    chatHistory = {
        index: 0, add: function (message) {
            if (!message) return;
            this[this.index++ % 10] = message;
        }, toJSON: function () {
            var a = [], i;
            for (i = 0; i < 10 && i < this.index; i++) {
                a.push(this[i]);
            }
            return {index: this.index % 10, log: a};
        }
    };

function addMessage(message, sender, time, color) {
    if (!message) return;
    if (sender && sender.substring(0,1) === "#") {
        color = sender;
        sender = null;
    }
    if (sender) {
        chatModule.addMsg({message: message, nickname: sender, time: time || Date.now()});
    } else {
        var li = $("<li></li>");
        li.html(message);
        if (time) {
            li.prop("title", new Date(time).toLocaleDateString());
        }
        li.css("color", color || "#00ff00");
        $("#chatlog").append(li);
    }
    root.newMsg = true;
}

// Add commands to the game
chatModule.send = function (type, message) {
    var originalMessage = message;
    if (type === "chat" && message && message.substring(0,1) === "/") {
        message = message.substring(1);
        if (message && message.substring(0,1) !== "/") {
            // Process command
            var index = message.indexOf(" "), command, message;
            if (index === -1) { // there's no space, just a command
                command = message;
                message = "";
            } else {
                command = message.substring(0, index);
                message = message.substring(index + 1);
            }
            // TODO: better command handling
            switch (command.toLowerCase()) {
                case "friendlist":
                case "friends":
                case "=friend":
                    var friendlist = Object.keys(friends),
                        friendMsg = "", glue = ", ";
                    if (friendlist.length) {
                        for (var i = 0; i < friendlist.length; i++) {
                            if (i > 0) {
                                friendMsg += glue;
                            }
                            if (root.online.hasOwnProperty(friendlist[i])) {
                                friendMsg += "*";
                            }
                            friendMsg += friendlist[i];
                        }
                    } else {
                        friendMsg = "None";
                    }
                    return addMessage(String.format("Your friends (*online): {0}", friendMsg));
                case "addfriend":
                case "friend":
                case "+friend":
                    if (!message) {
                        return addMessage(String.format("Invalid Syntax: /{0} [name of friend to add]", command), "#f00");
                    }
                    if (!friends.hasOwnProperty(message)) {
                        addFriend(message);
                        return addMessage(String.format("Added friend: {0}", message));
                    }
                    return addMessage(String.format("Already friends with: {0}", message));
                case "unfriend":
                case "delfriend":
                case "-friend":
                    if (!message) {
                        return addMessage(String.format("Invalid Syntax: /{0} [name of friend to remove]", command), "#f00");
                    }
                    if (friends.hasOwnProperty(message)) {
                        delFriend(message);
                        return addMessage(String.format("Removed friend: {0}", message));
                    }
                    return addMessage(String.format("Already friends with: {0}", message));
                default:
                    return addMessage(String.format("Unknown Command: {0}", command), "#f00");
            }
        }
    }
    return originalSend.apply(this, arguments);
};
// Override connect
chatModule.connect = function () {
    // load chat history
    if (sessionStorage.hasOwnProperty("plus.chatHistory")) {
        var storedHistory = JSON.parse(sessionStorage.getItem("plus.chatHistory")),
            length = storedHistory.log.length,
            index = storedHistory.index,
            additive, log;
        if (length) {
            // addMessage("*** Playback Starting ***");
            for (additive = 0; additive < length; additive++) {
                log = storedHistory.log[(index + additive) % length];
                chatHistory.add(log);
                this.addMsg(log);
            }
            addMessage("*** Playback Complete ***");
        }
    }
    // Connect normally
    var ret = originalConnect.apply(this, arguments);
    // Listen to socket events
    if (this.socket) {
        this.socket.on('chat', function(msg) {
            chatHistory.add(msg);
        });
        this.socket.on('userJoined', function(msg) {
            var name = msg.message.substring(0, msg.message.indexOf(" has")), index;
            if (friends.hasOwnProperty(name)) {
                friends[name] = true;
                addMessage(msg.message, "#E7E719");
            }
        });
        this.socket.on('userLeft', function (msg) {
            var name = msg.message.substring(0, msg.message.indexOf(" has")), index;
            if (friends.hasOwnProperty(name)) {
                friends[name] = false;
                addMessage(msg.message, "#E7E719");
            }
        });
    }
    return ret;
};

gameModule.init = function () {
    if (!initialized) {
        // load friendlist
        if (localStorage.hasOwnProperty("plus.friends")) {
            JSON.parse(localStorage.getItem("plus.friends")).forEach(function (name) {
                friends[name] = false;
            });
        }
        initialized = true;
    }
    return originalLoad.apply(this, arguments);
};
gameModule.save = function () {
    // save friendlist
    localStorage.setItem("plus.friends", JSON.stringify(Object.keys(friends)));
    // save chat history - saving here is wrong, chat happens even while the game is paused
    sessionStorage.setItem("plus.chatHistory", JSON.stringify(chatHistory));
    return originalSave.apply(this, arguments);;
};