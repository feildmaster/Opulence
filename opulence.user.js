// ==UserScript==
// @name        Opulence
// @author      feildmaster
// @description Modifications and Additions to the browser game Prosperity
// @namespace   https://feildmaster.com/
// @version     0.2pre
// @include       http://www.prosperity.ga/
// @source      https://github.com/feildmaster/Opulence
// @copyright   2015+, feildmaster
// @grant       none
// ==/UserScript==

// Polyfill start
if (!String.format) {
  String.format = function (format) {
    var args = Array.prototype.slice.call(arguments, 1);
    return format.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] !== 'undefined' ? args[number] : match;
    });
  };
}
if (!String.contains) {
    String.contains = function (string, needle) {
        return string.indexOf(needle) !== -1;
    };
}
if (!Object.each) {
    Object.each = function (object, callback, thisArg) {
        Object.keys(object).forEach(function (key) {
            callback.call(thisArg, this[key], key, this);
        }, object);
    };
}
// Polyfill end

// TODO: Be more "angular"   
// ApplicationConfiguration.registerModule('Opulence');
// angular.module("Opulence").service("ChatPlus", ['Chat']);

var root = angular.element(document.body).injector().get('$rootScope'),
    chatModule = angular.element(document).injector().get("Chat"),
    gameModule = angular.element(document).injector().get("Game"),
    friends = {
        /*name: actual name || false*/
    },
    isFriend = function (name) {
        name = name.toLowerCase();
        return Object.keys(friends).some(function (friend) {
            return friend.toLowerCase() === name;
        });
    },
    /**
     * Returns proper name if online, false if offline
     */
    isOnline = function (name) {
        name = name.toLowerCase();
        var person, online = root.online, length = online.length, i = 0;
        while (i < length) {
            person = online[i++];
            if (person.toLowerCase() === name) {
                return person;
            }
        }
        return false;
    },
    markFriend = function (name, value) {
        name = name.toLowerCase();
        Object.keys(friends).some(function (friend) {
            if (friend.toLowerCase() === name) {
                friends[friend] = value;
                return true;
            }
            return false;
        });
    },
    addFriend = function (name) {
        var online = isOnline(name);
        if (online) {
            name = online;
        }
        friends[name] = online;
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
                    var friendMsg = "", glue = ", ";
                    Object.each(friends, function (online, friend) {
                        if (friendMsg) {
                            friendMsg += glue;
                        }
                        if (online) {
                            // online is their fully-qualified name
                            friendMsg += "*" + online;
                        } else {
                            // Otherwise show their stored name
                            friendMsg += friend;
                        }
                    });
                    return addMessage(String.format("Your friends (*online): {0}", friendMsg || "None"));
                case "addfriend":
                case "friend":
                case "+friend":
                    if (!message) {
                        return addMessage(String.format("Invalid Syntax: /{0} [name of friend to add]", command), "#f00");
                    }
                    if (!isFriend(message)) {
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
                    if (isFriend(message)) {
                        delFriend(message);
                        return addMessage(String.format("Removed friend: {0}", message));
                    }
                    return addMessage(String.format("Not friends with: {0}", message));
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
    // Add socket events
    if (this.socket) {
        this.socket.on('chat', function(msg) {
            // Add chat history
            chatHistory.add(msg);
        });
        this.socket.on('userJoined', function(msg) {
            var name = msg.message.substring(0, msg.message.indexOf(" has")), index;
            if (isFriend(name)) {
                // Mark as online
                markFriend(name, name);
                // Display connection message
                addMessage(msg.message, "#E7E719");
            }
        });
        this.socket.on('userLeft', function (msg) {
            var name = msg.message.substring(0, msg.message.indexOf(" has")), index;
            if (isFriend(name)) {
                // Mark as offline
                markFriend(name, false)
                // Display disconnect message
                addMessage(msg.message, "#E7E719");
            }
        });
        // Mark initial connected friends
        this.socket.once('listOfUsers', function (msg) {
            
        });
    }
    return ret;
};

gameModule.init = function () {
    if (!initialized) {
        // load friend list
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
    // save chat history - TODO: saving here is wrong, chat happens even while the game is paused
    sessionStorage.setItem("plus.chatHistory", JSON.stringify(chatHistory));
    return originalSave.apply(this, arguments);;
};
