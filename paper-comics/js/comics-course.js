window.COMICS_COURSE = {
  length:1360,
  actionLength:1200,
  waveCount:21,
  opening:[{z:0,x:1.4},{z:35,x:-1.6},{z:70,x:-1.6},{z:105,x:1.5},{z:115,x:1.5},{z:150,x:-1.4},{z:160,x:-1.4},{z:194,x:.8}],
  waves:[
    {id:0,from:35,to:165,start:-4.4,end:-3.2,arc:2.2,height:2.6,width:10},
    {id:1,from:205,to:335,start:-1.7,end:-4.4,arc:-2.1,height:3.2,width:10.5},
    {id:2,from:390,to:530,start:-5.8,end:-2.4,arc:1.4,height:3.7,width:11},
    {id:3,from:555,to:690,start:-1.8,end:-4.4,arc:-2.2,height:3.3,width:10.2},
    {id:4,from:755,to:905,start:-4.8,end:-1.8,arc:2.1,height:4.2,width:11.2},
    {id:5,from:930,to:1080,start:-1.7,end:-4.8,arc:-2,height:4.6,width:11.7},
    {id:6,from:1100,to:1185,start:-5,end:-2.8,arc:1,height:2.8,width:9.5}
  ],
  sections:[
    {from:0,to:180,title:'ПОЙМАЙ РИТМ'},
    {from:180,to:380,title:'В ХОРОШЕЙ КОМПАНИИ'},
    {from:380,to:620,title:'СМОТРИ ПОД ДОСКУ'},
    {from:620,to:880,title:'АКВАБАЙКИ НА ГОРИЗОНТЕ'},
    {from:880,to:1100,title:'ТВОЯ БОЛЬШАЯ ВОЛНА'},
    {from:1100,to:1360,title:'ФИНИШНЫЙ СПРИНТ'}
  ],
  hazards:[
    {type:'flotsam',prop:'flamingo',x:1.4,z:70},
    {type:'flotsam',prop:'log',x:-1.6,z:115},
    {type:'flotsam',prop:'barrel',x:1.5,z:160},
    {type:'jetski',x:5,z:10,direction:1,mode:'duel'},
    {type:'shark',x:-5,z:610,phase:0,direction:1,mode:'chase'},
    {type:'flotsam',prop:'cooler',x:3.5,z:726},
    {type:'shark',x:3.5,z:955,phase:2.4,direction:-1,mode:'chase'},
    {type:'flotsam',prop:'suitcase',x:0,z:976},
    {type:'flotsam',prop:'ball',x:2.5,z:1036}
  ]
};
