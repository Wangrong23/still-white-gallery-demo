// Outcomes are factual; each account belongs only to the character reading it.
const endings = {
  "zh": {
    "DETECTED": [
      [
        "找到你了。",
        "石膏粉落在他的领口上。会计的袖口也沾过这些。你总算找到了一个能对上卷宗的地方。"
      ],
      [
        "还差一会儿。",
        "约好的人还没来，先等到了这顶礼帽。你在这里站了这么久，连呼吸都放轻了。"
      ]
    ],
    "FOUND YOU": [
      [
        "烟还亮着。",
        "脸贴上地板，才觉出石头这么凉。掉在眼前的烟还亮着。门外迟迟没有脚步声。"
      ],
      [
        "可以喘气了。",
        "你等了一会儿，他没有再起来。终于能大口喘气了，却被自己的声音吓了一跳。"
      ]
    ],
    "ESCAPED": [
      [
        "外面还有灯。",
        "街上还有人。你走进灯光里，把展馆的地址又报了一遍。这回，得有人陪你进去。"
      ],
      [
        "脚步声远了。",
        "他的脚步到了门外。你又等了几拍，才敢换一口气。衣袋里的纸已经被汗浸软了。"
      ]
    ],
    "KILLER ESCAPED": [
      [
        "就差这一步。",
        "南门外是一条普通的街。晚归的人，亮着灯的橱窗。那件灰衣服一进去，就再也分不出来了。"
      ],
      [
        "别回头。",
        "走到第二个街口，你才把步子放慢。橱窗照出一张寻常的脸。领口还有一点白，你低头拍掉了。"
      ]
    ],
    "SURVIVED": [
      [
        "总算来了。",
        "门口亮了。熟悉的制服，你叫得出名字的人。肩膀这才松下来，烟已经凉透了。"
      ],
      [
        "又有人进来了。",
        "门口的光扫过展台。有人叫了警探的名字，语气很熟。你把刚要吸进去的那口气停住了。"
      ]
    ]
  },
  "en": {
    "DETECTED": [
      [
        "THERE YOU ARE.",
        "Plaster dust on his collar. There was some on the accountant's cuff, too. At last, something here matches the case file."
      ],
      [
        "A LITTLE LONGER.",
        "The man you were meeting never came. The fedora found you first. All that time standing here, barely letting yourself breathe."
      ]
    ],
    "FOUND YOU": [
      [
        "STILL BURNING.",
        "With your cheek against the floor, you feel how cold the stone is. Your cigarette is still burning where it fell. No footsteps at the door."
      ],
      [
        "BREATHE.",
        "You wait a moment. He doesn't get up. You can finally take a full breath. The sound of it makes you flinch."
      ]
    ],
    "ESCAPED": [
      [
        "LIGHTS OUTSIDE.",
        "There are still people on the street. You step into the light and give the gallery's address again. Someone needs to come in with you this time."
      ],
      [
        "FOOTSTEPS OUTSIDE.",
        "His footsteps pass through the door. You wait a few more beats before taking a breath. The paper in your pocket has gone soft with sweat."
      ]
    ],
    "KILLER ESCAPED": [
      [
        "SO CLOSE.",
        "Beyond the south door, an ordinary street. People heading home. Lighted shop windows. The gray coat blends into it all, and you lose him."
      ],
      [
        "KEEP WALKING.",
        "Two blocks away, you finally slow down. An ordinary face looks back from a shop window. A little white dust on the collar. You look down and brush it off."
      ]
    ],
    "SURVIVED": [
      [
        "AT LAST.",
        "Light at the door. Familiar uniforms. Men whose names you know. Your shoulders loosen at last. The cigarette has gone cold."
      ],
      [
        "MORE FOOTSTEPS.",
        "Light sweeps across the plinths. Someone calls the detective by name, like an old friend. You stop just short of drawing breath."
      ]
    ]
  }
};

const outcomes = {
  zh: { DETECTED: "来客被识破", "FOUND YOU": "警探倒下", ESCAPED: "警探撤离", "KILLER ESCAPED": "来客脱身", SURVIVED: "警探存活至支援抵达" },
  en: { DETECTED: "Visitor exposed", "FOUND YOU": "Detective down", ESCAPED: "Detective withdrew", "KILLER ESCAPED": "Visitor escaped", SURVIVED: "Detective survived until backup" },
};

export function resultNarrative(result, role, language = "zh") {
  const locale = language === "en" ? "en" : "zh";
  const detective = role === "detective";
  const winner = ["FOUND YOU", "KILLER ESCAPED"].includes(result) ? "killer" : "detective";
  const [title, body] = endings[locale][result][detective ? 0 : 1];
  const won = winner === role;
  const account = locale === "zh" ? (detective ? "警探" : "来客") : (detective ? "DETECTIVE" : "VISITOR");
  const verdict = locale === "zh" ? (won ? "本局胜利" : "本局失利") : (won ? "ROUND WON" : "ROUND LOST");
  return { title, body, won, label: `${account} · ${verdict}`, outcome: outcomes[locale][result] };
}
