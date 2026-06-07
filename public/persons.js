const PERSONS = [
  {
    name: "Angela Merkel",
    aliases: ["Merkel"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Angela_Merkel_2019_%28cropped%29.jpg/480px-Angela_Merkel_2019_%28cropped%29.jpg",
    info: "Ehemalige Bundeskanzlerin Deutschlands (2005–2021)"
  },
  {
    name: "Olaf Scholz",
    aliases: ["Scholz"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Olaf_Scholz_%28SPD%29_2021_%28cropped%29.jpg/480px-Olaf_Scholz_%28SPD%29_2021_%28cropped%29.jpg",
    info: "Bundeskanzler Deutschlands (2021–2025)"
  },
  {
    name: "Friedrich Merz",
    aliases: ["Merz"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Friedrich_Merz_2022_%28cropped%29.jpg/480px-Friedrich_Merz_2022_%28cropped%29.jpg",
    info: "CDU-Vorsitzender und Bundeskanzler (seit 2025)"
  },
  {
    name: "Annalena Baerbock",
    aliases: ["Baerbock"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Annalena_Baerbock_%28cropped%29.jpg/480px-Annalena_Baerbock_%28cropped%29.jpg",
    info: "Bundesaußenministerin Deutschlands"
  },
  {
    name: "Robert Habeck",
    aliases: ["Habeck"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Robert_Habeck_%282019%29.jpg/480px-Robert_Habeck_%282019%29.jpg",
    info: "Bundesminister für Wirtschaft und Klimaschutz"
  },
  {
    name: "Barack Obama",
    aliases: ["Obama"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/President_Barack_Obama.jpg/480px-President_Barack_Obama.jpg",
    info: "44. Präsident der Vereinigten Staaten (2009–2017)"
  },
  {
    name: "Donald Trump",
    aliases: ["Trump"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Donald_Trump_official_portrait.jpg/480px-Donald_Trump_official_portrait.jpg",
    info: "45. und 47. Präsident der Vereinigten Staaten"
  },
  {
    name: "Emmanuel Macron",
    aliases: ["Macron"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Emmanuel_Macron_in_2019.jpg/480px-Emmanuel_Macron_in_2019.jpg",
    info: "Präsident der Französischen Republik (seit 2017)"
  },
  {
    name: "Vladimir Putin",
    aliases: ["Putin"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Putin_17-11-2021_%28cropped%29.jpg/480px-Putin_17-11-2021_%28cropped%29.jpg",
    info: "Präsident der Russischen Föderation"
  },
  {
    name: "Joe Biden",
    aliases: ["Biden"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Joe_Biden_presidential_portrait.jpg/480px-Joe_Biden_presidential_portrait.jpg",
    info: "46. Präsident der Vereinigten Staaten (2021–2025)"
  },
  {
    name: "Elon Musk",
    aliases: ["Musk"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Elon_Musk_Royal_Society_%28crop2%29.jpg/480px-Elon_Musk_Royal_Society_%28crop2%29.jpg",
    info: "CEO von Tesla und SpaceX"
  },
  {
    name: "Bill Gates",
    aliases: ["Gates"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Bill_Gates_2017_%28cropped%29.jpg/480px-Bill_Gates_2017_%28cropped%29.jpg",
    info: "Mitgründer von Microsoft"
  },
  {
    name: "Mark Zuckerberg",
    aliases: ["Zuckerberg", "Zuck"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Mark_Zuckerberg_F8_2019_Keynote_%2832830578717%29_%28cropped%29.jpg/480px-Mark_Zuckerberg_F8_2019_Keynote_%2832830578717%29_%28cropped%29.jpg",
    info: "CEO von Meta (Facebook)"
  },
  {
    name: "Taylor Swift",
    aliases: ["Swift"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/191125_Taylor_Swift_at_the_2019_American_Music_Awards_%28cropped%29.png/480px-191125_Taylor_Swift_at_the_2019_American_Music_Awards_%28cropped%29.png",
    info: "US-amerikanische Sängerin und Songwriterin"
  },
  {
    name: "Cristiano Ronaldo",
    aliases: ["Ronaldo", "CR7"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Cristiano_Ronaldo_2018.jpg/480px-Cristiano_Ronaldo_2018.jpg",
    info: "Portugiesischer Fußballstar"
  },
  {
    name: "Lionel Messi",
    aliases: ["Messi"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg/480px-Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg",
    info: "Argentinischer Fußballstar"
  },
  {
    name: "Papst Franziskus",
    aliases: ["Franziskus", "Papst", "Pope Francis"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Pope_Francis_in_March_2013.jpg/480px-Pope_Francis_in_March_2013.jpg",
    info: "Oberhaupt der römisch-katholischen Kirche"
  },
  {
    name: "Greta Thunberg",
    aliases: ["Thunberg", "Greta"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Greta_Thunberg_02.jpg/480px-Greta_Thunberg_02.jpg",
    info: "Schwedische Klimaaktivistin"
  },
  {
    name: "Karl Lauterbach",
    aliases: ["Lauterbach"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Karl_Lauterbach_%28cropped%29.jpg/480px-Karl_Lauterbach_%28cropped%29.jpg",
    info: "Bundesminister für Gesundheit"
  },
  {
    name: "Jeff Bezos",
    aliases: ["Bezos"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Jeff_Bezos_at_the_Seattle_Museum_of_History_and_Industry_%28cropped%29.jpg/480px-Jeff_Bezos_at_the_Seattle_Museum_of_History_and_Industry_%28cropped%29.jpg",
    info: "Gründer von Amazon"
  }
];
