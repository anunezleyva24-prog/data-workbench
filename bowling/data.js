// Transcribed from the six scoreboard photos. Frames are written exactly as shown on screen:
// "X" = strike, "/" = spare, "-" = miss (0). Frame 10 may hold 3 balls.
// `shown` is the running total printed under each frame and `total` the final score on the board;
// the app recomputes scores from the balls and must reproduce these numbers exactly.
window.BOWLING_DATA = {
  event: "Bowling night",
  players: ["Simon", "Rabeya", "Lola", "Antonio", "Dominik", "Sergio", "Niclas", "Yannic"],
  games: [
    {
      id: "R1-L26", round: 1, lane: 26, photo: "IMG_3697", laneTotal: 375,
      rows: [
        { player: "Simon",   frames: ["6-","71","1-","9-","7-","33","9/","9/","23","7/1"], shown: [6,14,15,24,31,37,56,68,73,84], total: 84 },
        { player: "Sergio",  frames: ["63","62","72","8-","72","71","-9","X","8-","63"],  shown: [9,17,26,34,43,51,60,78,86,95], total: 95 },
        { player: "Lola",    frames: ["7-","81","-1","8-","8-","8-","7-","3-","42","17"], shown: [7,16,17,25,33,41,48,51,57,65], total: 65 },
        { player: "Dominik", frames: ["6-","7-","X","X","9/","63","X","81","8-","8-"],   shown: [6,13,42,62,78,87,106,115,123,131], total: 131 }
      ]
    },
    {
      id: "R1-L25", round: 1, lane: 25, photo: "IMG_3699", laneTotal: 267,
      rows: [
        { player: "Rabeya",  frames: ["5-","--","16","--","-7","1-","-8","-5","3-","X36"], shown: [5,5,12,12,19,20,28,33,36,55], total: 55 },
        { player: "Antonio", frames: ["6-","8-","--","-1","9-","5-","-8","-9","-3","--"],  shown: [6,14,14,15,24,29,37,46,49,49], total: 49 },
        { player: "Niclas",  frames: ["-6","8-","5-","6/","7-","6-","8-","71","7/","9-"],  shown: [6,14,19,36,43,49,57,65,84,93], total: 93 },
        { player: "Yannic",  frames: ["9/","--","13","81","9-","62","61","6-","35","81"],  shown: [10,10,14,23,32,40,47,53,61,70], total: 70 }
      ]
    },
    {
      id: "R2-L25", round: 2, lane: 25, photo: "IMG_3700", laneTotal: 358,
      rows: [
        { player: "Dominik", frames: ["-8","1-","5-","-3","-7","9-","8/","35","-/","8-"],  shown: [8,9,14,17,24,33,46,54,72,80], total: 80, boardName: "DOMINK" },
        { player: "Sergio",  frames: ["26","8-","4-","9/","-8","15","-8","9-","71","44"],  shown: [8,16,20,30,38,44,52,61,69,77], total: 77 },
        { player: "Niclas",  frames: ["63","3-","X","X","8-","6-","36","15","9-","9-"],    shown: [9,12,40,58,66,72,81,87,96,105], total: 105 },
        { player: "Yannic",  frames: ["6-","X","-7","-8","7-","9-","9/","7-","61","6/1"],  shown: [6,23,30,38,45,54,71,78,85,96], total: 96 }
      ]
    },
    {
      id: "R2-L26", round: 2, lane: 26, photo: "IMG_3701", laneTotal: 319,
      rows: [
        { player: "Simon",   frames: ["72","72","6-","36","9-","X","63","X","X","9/7"],  shown: [9,18,24,33,42,61,70,99,119,136], total: 136 },
        { player: "Rabeya",  frames: ["-6","-3","-9","--","61","61","8-","72","9-","-8"], shown: [6,9,18,18,25,32,40,49,58,66], total: 66 },
        { player: "Lola",    frames: ["9-","7-","-4","52","-6","45","16","1-","3-","7-"],  shown: [9,16,20,27,33,42,49,50,53,60], total: 60 },
        { player: "Antonio", frames: ["--","--","18","18","-5","7-","8-","7-","-3","81"],  shown: [0,0,9,18,23,30,38,45,48,57], total: 57 }
      ]
    },
    {
      id: "R3-L25", round: 3, lane: 25, photo: "IMG_3702", laneTotal: 268,
      rows: [
        { player: "Simon",   frames: ["18","72","6-","6-","72","6-","52","33","9/","63"],  shown: [9,18,24,30,39,45,52,58,74,83], total: 83 },
        { player: "Rabeya",  frames: ["7-","33","-6","3-","1-","7-","-6","3-","--","--"],  shown: [7,13,19,22,23,30,36,39,39,39], total: 39 },
        { player: "Niclas",  frames: ["7-","6/","7-","7-","3-","--","--","3-","-1","13"],  shown: [7,24,31,38,41,41,41,44,45,49], total: 49 },
        { player: "Yannic",  frames: ["-8","9-","61","5-","X","-8","X","8-","-8","53"],    shown: [8,17,24,29,47,55,73,81,89,97], total: 97 }
      ]
    },
    {
      id: "R3-L26", round: 3, lane: 26, photo: "IMG_3703", laneTotal: 320,
      rows: [
        { player: "Sergio",  frames: ["81","18","9-","9-","7-","7/","6-","6/","13","9/5"], shown: [9,18,27,36,43,59,65,76,80,95], total: 95 },
        { player: "Dominik", frames: ["7-","-8","1-","-7","71","8-","7-","-2","-7","9-"],  shown: [7,15,16,23,31,39,46,48,55,64], total: 64 },
        { player: "Lola",    frames: ["7-","9-","81","X","81","35","71","1-","-1","9/7"],  shown: [7,16,25,44,53,61,69,70,71,88], total: 88 },
        { player: "Antonio", frames: ["61","7-","--","61","7-","7-","5/","6-","8-","8-"],  shown: [7,14,14,21,28,35,51,57,65,73], total: 73 }
      ]
    }
  ]
};
