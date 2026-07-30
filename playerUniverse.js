
const REGIONS={
 germanic:{
  first:["Lukas","Jonas","Leon","Noah","Elias","Finn","Mats","Jannik","Niklas","Moritz","Emil","Felix","Henrik","Timo","Linus","Maximilian","Julian","David","Anton","Florian","Nils","Sven","Mikkel","Søren","Anders","Rasmus","Viktor","Oskar"],
  last:["Müller","Schneider","Fischer","Weber","Wagner","Becker","Hoffmann","Schäfer","Koch","Bauer","Jensen","Nielsen","Larsen","Hansen","Berg","Lindström","Nygaard","Johansson","Andersson","Eriksen","Højlund","van Dijk","de Boer","Vermeer","Vos"]
 },
 romance:{
  first:["Luca","Marco","Matteo","Alessandro","Giovanni","Andrea","Lorenzo","Nicolò","Tiago","João","Rafael","Miguel","Santiago","Joaquín","Iker","Álvaro","Hugo","Enzo","Théo","Jules","Mathis","Antoine","Gaël","Rémi","Dario","Paolo","Bruno","Leandro"],
  last:["Rossi","Bianchi","Romano","Ricci","Moretti","Conti","Ferreira","Moreira","Nascimento","Carvalho","Silva","Santos","Pereira","Echeverría","Mendizábal","Navarro","Martínez","García","Dubois","Lefèvre","Moreau","Girard","Fontaine","Bernard","da Costa","de Sá","dos Santos"]
 },
 slavic:{
  first:["Luka","Nikola","Milan","Marko","Ivan","Matej","Filip","Jakub","Tomasz","Marek","Petr","Jan","Dániel","Bence","Ádám","Arseniy","Oleksandr","Mykola","Maksim","Dmitri","Viktor","Andrei","Bojan","Nemanja","Stjepan","Kacper"],
  last:["Petrović","Jovanović","Nikolić","Kovačević","Horvat","Novak","Kowalski","Zieliński","Nowak","Dvořák","Svoboda","Székely","Nagy","Kovalenko","Shevchenko","Bondarenko","Ivanov","Sokolov","Popov","Stoica","Ionescu","Marin","Hadžić","Babić","Vuković"]
 },
 african:{
  first:["Mamadou","Boubacar","Ibrahima","Ousmane","Cheikh","Sadio","Amadou","Moussa","Kofi","Kwame","Yaw","Kojo","Chinedu","Emeka","Tunde","Ayodele","Samuel","Elijah","Thabo","Sipho","Lethabo","Bongani","Youssef","Ayoub","Hakim","Rachid","Ismaël"],
  last:["Diarra","Traoré","Konaté","N’Diaye","Diallo","Camara","Touré","Keita","Asare","Mensah","Boateng","Agyemang","Okafor","Nwosu","Adeyemi","Balogun","Mokoena","Dlamini","Khumalo","El Mansouri","Bennani","Amrani","Abdelkader","Ouédraogo","Banda"]
 },
 arabic:{
  first:["Omar","Youssef","Ahmed","Karim","Rami","Sami","Fares","Tariq","Zayd","Nabil","Bilal","Amir","Hassan","Ali","Mahmoud","Khaled","Mustafa","Ibrahim","Hamza","Walid"],
  last:["Al-Hassan","El Masri","Ben Salah","Al Mansouri","Haddad","Khalil","Rahman","Abbas","Nasser","Saleh","Farouk","Hamdan","Al-Khatib","Mahmoud","Bouzid","Cherif","Saidi","Bensaïd"]
 },
 eastasia:{
  first:["Haruto","Riku","Yuto","Kaito","Ren","Daichi","Takumi","Min-jun","Ji-hoon","Seo-jun","Hyun-woo","Wei","Jun","Hao","Tao","Jian","Ming","Chen","Yichen","Zixuan"],
  last:["Takahashi","Sato","Suzuki","Nakamura","Kobayashi","Watanabe","Kim","Lee","Park","Choi","Jung","Kang","Wang","Li","Zhang","Liu","Chen","Yang","Huang","Zhao"]
 },
 southeastasia:{
  first:["Nattapong","Chanathip","Kritsada","Supachai","Anan","Somchai","Nguyen","Minh","Quang","Bao","Duc","Arif","Bima","Rizky","Fajar","Adi","Hakim","Irfan","Azlan","Syafiq"],
  last:["Srisuwan","Boonmee","Thongchai","Phan","Tran","Nguyen","Le","Hoang","Santoso","Pratama","Saputra","Hidayat","Wijaya","Rahman","Ismail","Hassan","Lim","Tan","Chua","Santos"]
 },
 southasia:{
  first:["Arjun","Rohan","Vikram","Ayaan","Kabir","Ishaan","Rahul","Dev","Aditya","Sameer","Imran","Faisal","Hasan","Rafi","Naveed","Kamal","Sanjay","Akash","Nimal","Dinesh"],
  last:["Sharma","Patel","Singh","Kumar","Mehta","Kapoor","Khan","Ahmed","Rahman","Hossain","Chowdhury","Perera","Fernando","Silva","Gurung","Thapa","Rana","Malik"]
 },
 caucasus:{
  first:["Giorgi","Nika","Lasha","Levan","Aram","Tigran","Narek","Davිත","Aibek","Temur","Ruslan","Aziz","Bekzod","Eldar","Murad","Ilia"],
  last:["Kvaratskhelia","Beridze","Kapanadze","Mkhitaryan","Sargsyan","Petrosyan","Sadykov","Nazarov","Karimov","Mammadov","Aliyev","Isayev","Abdullayev","Gurbanov"]
 },
 americas:{
  first:["Ethan","Liam","Mason","Logan","Caleb","Jayden","Tyler","Cameron","Diego","Mateo","Thiago","Kevin","Bryan","Dylan","Alexis","Cristian","Nicolás","Facundo","Agustín","Matías"],
  last:["Smith","Johnson","Brown","Miller","Davis","Wilson","Moore","Taylor","Anderson","Thomas","Rodríguez","González","López","Hernández","Ramírez","Castillo","Rojas","Suárez","Acosta","Vargas"]
 },
 pacific:{
  first:["Tane","Manaia","Wiremu","Kauri","Sione","Mele","Jone","Pita","Tevita","Latu","Noa","Aisea","Semi","Mika","Tavita"],
  last:["Rangi","Ngata","Te Rito","Tuilagi","Fifita","Vunipola","Nadolo","Latu","Sopoaga","Savea","Ioane","Tupou","Koroibete"]
 }
};


const COUNTRY_NAME_POOLS={
 "Schottland":{first:["Callum","Finlay","Euan","Fraser","Lewis","Logan","Rory","Ross","Scott","Jamie","Craig","Duncan","Alistair","Hamish","Kieran","Cameron","Aiden","Connor","Ryan","Liam"],last:["MacDonald","McGregor","Robertson","Campbell","Stewart","Murray","Fraser","Gordon","Ferguson","Hamilton","McKenzie","Douglas","Crawford","Wallace","Sinclair","McLean","Davidson","Johnston","Grant","Kerr"]},
 "England":{first:["Jack","Harry","Oliver","George","Charlie","Alfie","James","Thomas","William","Henry","Ben","Luke","Daniel","Samuel","Mason","Ethan","Jacob","Max","Leo","Archie"],last:["Smith","Taylor","Brown","Wilson","Johnson","Davies","Robinson","Wright","Thompson","Evans","Walker","White","Roberts","Green","Hall","Wood","Jackson","Clarke","Harris","Lewis"]},
 "Wales":{first:["Rhys","Dafydd","Owain","Iwan","Gareth","Aled","Gethin","Ieuan","Cai","Tomos","Morgan","Dylan","Ellis","Harri","Osian","Bryn"],last:["Jones","Williams","Davies","Evans","Thomas","Roberts","Lewis","Hughes","Morgan","Griffiths","Rees","Price","Lloyd","Richards","Powell","Parry"]},
 "Irland":{first:["Sean","Conor","Cian","Eoin","Darragh","Oisin","Ronan","Niall","Ciaran","Fionn","Padraig","Declan","Aidan","Shane","Liam","Finn"],last:["Murphy","Kelly","O'Sullivan","Walsh","O'Brien","Byrne","Ryan","O'Connor","O'Neill","Reilly","Doyle","McCarthy","Gallagher","Kennedy","Lynch","Murray"]},
 "Nordirland":{first:["Conor","Ronan","Ciaran","Niall","Sean","Patrick","Jamie","Kyle","Ross","Ryan","Callum","Darragh","Eoin","Liam","Daniel","Jack"],last:["Campbell","Murray","Kelly","O'Neill","McLaughlin","McCann","Doherty","Quinn","Hughes","McKenna","Devlin","Boyd","McAuley","Burns","Hamilton","Carson"]},
 "Schweden":{first:["Viktor","Erik","Johan","Emil","Oscar","Anton","Ludwig","Nils","Gustav","Axel","Filip","Isak","Albin","Linus","Hugo","Elias"],last:["Andersson","Johansson","Karlsson","Nilsson","Eriksson","Larsson","Olsson","Persson","Svensson","Gustafsson","Lindberg","Lindström","Berg","Bergström","Holm","Ekström"]},
 "Norwegen":{first:["Erik","Sindre","Mats","Marius","Kristoffer","Henrik","Eirik","Magnus","Jonas","Tobias","Lars","Emil","Ola","Even","Håkon","Fredrik"],last:["Hansen","Johansen","Olsen","Larsen","Andersen","Pedersen","Nilsen","Kristiansen","Jensen","Karlsen","Berg","Haugen","Solberg","Dahl","Lund","Moen"]},
 "Dänemark":{first:["Mikkel","Frederik","Christian","Anders","Rasmus","Mathias","Nikolaj","Mads","Emil","Magnus","Oliver","Lasse","Søren","Jonas","Kasper","William"],last:["Jensen","Nielsen","Hansen","Pedersen","Andersen","Christensen","Larsen","Sørensen","Rasmussen","Jørgensen","Petersen","Madsen","Kristensen","Olsen","Thomsen","Poulsen"]},
 "Deutschland":{first:["Lukas","Leon","Jonas","Felix","Finn","Paul","Maximilian","Moritz","Julian","Niklas","Tim","Florian","David","Fabian","Jan","Tobias","Noah","Elias","Ben","Tom"],last:["Müller","Schmidt","Schneider","Fischer","Weber","Meyer","Wagner","Becker","Hoffmann","Schäfer","Koch","Bauer","Richter","Klein","Wolf","Schröder","Neumann","Schwarz","Zimmermann","Krüger"]},
 "Frankreich":{first:["Lucas","Hugo","Louis","Nathan","Jules","Théo","Antoine","Mathis","Enzo","Clément","Baptiste","Maxime","Alexandre","Romain","Pierre","Adrien"],last:["Martin","Bernard","Dubois","Thomas","Robert","Richard","Petit","Durand","Leroy","Moreau","Simon","Laurent","Michel","Lefèvre","Mercier","Roux"]},
 "Spanien":{first:["Alejandro","Daniel","Pablo","Álvaro","Javier","Sergio","Diego","Hugo","Adrián","Mario","Carlos","Miguel","Iván","David","Rubén","Álex"],last:["García","Martínez","Rodríguez","López","Sánchez","Pérez","Gómez","Martín","Jiménez","Ruiz","Hernández","Díaz","Moreno","Muñoz","Álvarez","Romero"]},
 "Italien":{first:["Luca","Marco","Matteo","Alessandro","Andrea","Francesco","Federico","Davide","Lorenzo","Simone","Gabriele","Riccardo","Niccolò","Tommaso","Giovanni","Stefano"],last:["Rossi","Russo","Ferrari","Esposito","Bianchi","Romano","Colombo","Ricci","Marino","Greco","Bruno","Gallo","Conti","De Luca","Mancini","Lombardi"]},
 "Niederlande":{first:["Daan","Sem","Lucas","Finn","Milan","Bram","Sven","Jesse","Thijs","Joris","Wout","Niels","Koen","Lars","Joost","Mats"],last:["De Jong","Jansen","De Vries","Van den Berg","Van Dijk","Bakker","Visser","Smit","Meijer","De Boer","Mulder","De Groot","Bos","Vos","Peters","Hendriks"]},
 "Portugal":{first:["João","Tiago","Miguel","Diogo","Rafael","Gonçalo","André","Pedro","Bruno","Nuno","Ricardo","Fábio","Tomás","Francisco","Luís","Rúben"],last:["Silva","Santos","Ferreira","Pereira","Oliveira","Costa","Rodrigues","Martins","Jesus","Sousa","Fernandes","Gonçalves","Gomes","Lopes","Marques","Alves"]},
 "Polen":{first:["Jakub","Kacper","Mateusz","Piotr","Michał","Szymon","Bartosz","Tomasz","Kamil","Paweł","Łukasz","Dawid","Maciej","Wojciech","Filip","Jan"],last:["Nowak","Kowalski","Wiśniewski","Wójcik","Kowalczyk","Kamiński","Lewandowski","Zieliński","Szymański","Woźniak","Dąbrowski","Kozłowski","Jankowski","Mazur","Kwiatkowski","Wojciechowski"]},
 "Österreich":{first:["Lukas","Florian","Matthias","David","Michael","Daniel","Sebastian","Dominik","Philipp","Felix","Jonas","Simon","Maximilian","Tobias","Fabian","Martin"],last:["Gruber","Huber","Bauer","Wagner","Müller","Pichler","Steiner","Moser","Mayer","Hofer","Berger","Leitner","Fuchs","Eder","Schmid","Reiter"]},
 "Schweiz":{first:["Luca","Noah","Leon","Jan","Nico","Marco","Fabian","Simon","Jonas","Livio","Silvan","Florian","Yannick","David","Kevin","Sandro"],last:["Müller","Meier","Schmid","Keller","Weber","Huber","Meyer","Steiner","Frei","Brunner","Baumann","Gerber","Zimmermann","Schneider","Roth","Lehmann"]},
 "Kroatien":{first:["Luka","Ivan","Marko","Ante","Josip","Mateo","Nikola","Marin","Dario","Domagoj","Lovro","Petar","Filip","Duje","Toni","Bruno"],last:["Horvat","Kovačević","Babić","Marić","Jurić","Kovačić","Knežević","Vuković","Matić","Pavlović","Perić","Božić","Radić","Šarić","Grgić","Jukić"]},
 "Serbien":{first:["Nikola","Luka","Stefan","Marko","Miloš","Dušan","Aleksandar","Nemanja","Filip","Uroš","Vladimir","Lazar","Đorđe","Ivan","Mihajlo","Andrija"],last:["Jovanović","Petrović","Nikolić","Marković","Đorđević","Stojanović","Ilić","Pavlović","Milošević","Simić","Kostić","Mitić","Lazić","Krstić","Vasić","Radić"]},
 "Rumänien":{first:["Andrei","Alexandru","Mihai","Ionuț","Vlad","Cristian","Gabriel","Radu","Florin","Adrian","Denis","Rareș","Darius","Ștefan","Cosmin","Bogdan"],last:["Popescu","Ionescu","Popa","Dumitru","Stan","Stoica","Gheorghe","Radu","Marin","Tudor","Dobre","Barbu","Munteanu","Mocanu","Enache","Ilie"]},
 "Türkei":{first:["Emir","Kerem","Arda","Burak","Hakan","Oğuz","Mert","Yusuf","Can","Berk","Kaan","Onur","Serkan","Tolga","Umut","Enes"],last:["Yılmaz","Kaya","Demir","Şahin","Çelik","Yıldız","Yıldırım","Öztürk","Aydın","Özdemir","Arslan","Doğan","Kılıç","Aslan","Çetin","Kurt"]},
 "Brasilien":{first:["Gabriel","Lucas","João","Pedro","Matheus","Rafael","Bruno","Felipe","Vinícius","Gustavo","Diego","Caio","Thiago","André","Renan","Eduardo"],last:["Silva","Santos","Oliveira","Souza","Pereira","Costa","Rodrigues","Almeida","Nascimento","Lima","Araújo","Fernandes","Carvalho","Gomes","Martins","Rocha"]},
 "Argentinien":{first:["Juan","Matías","Santiago","Nicolás","Franco","Lautaro","Facundo","Julián","Agustín","Tomás","Gonzalo","Emiliano","Lucas","Federico","Ángel","Valentín"],last:["González","Rodríguez","Gómez","Fernández","López","Martínez","Pérez","García","Sánchez","Romero","Díaz","Álvarez","Ruiz","Torres","Ramírez","Acosta"]}
};

const COUNTRY_ROWS = [
["Deutschland","🇩🇪","germanic"],["Österreich","🇦🇹","germanic"],["Schweiz","🇨🇭","germanic"],["Niederlande","🇳🇱","germanic"],["Belgien","🇧🇪","romance"],["Luxemburg","🇱🇺","germanic"],["Dänemark","🇩🇰","germanic"],["Schweden","🇸🇪","germanic"],["Norwegen","🇳🇴","germanic"],["Finnland","🇫🇮","germanic"],["Island","🇮🇸","germanic"],["England","🏴","germanic"],["Schottland","🏴","germanic"],["Wales","🏴","germanic"],["Irland","🇮🇪","germanic"],["Nordirland","🇬🇧","germanic"],
["Frankreich","🇫🇷","romance"],["Spanien","🇪🇸","romance"],["Portugal","🇵🇹","romance"],["Italien","🇮🇹","romance"],["Andorra","🇦🇩","romance"],["Monaco","🇲🇨","romance"],["San Marino","🇸🇲","romance"],["Malta","🇲🇹","romance"],["Rumänien","🇷🇴","slavic"],["Moldau","🇲🇩","slavic"],
["Polen","🇵🇱","slavic"],["Tschechien","🇨🇿","slavic"],["Slowakei","🇸🇰","slavic"],["Ungarn","🇭🇺","slavic"],["Slowenien","🇸🇮","slavic"],["Kroatien","🇭🇷","slavic"],["Bosnien und Herzegowina","🇧🇦","slavic"],["Serbien","🇷🇸","slavic"],["Montenegro","🇲🇪","slavic"],["Nordmazedonien","🇲🇰","slavic"],["Albanien","🇦🇱","slavic"],["Kosovo","🇽🇰","slavic"],["Bulgarien","🇧🇬","slavic"],["Griechenland","🇬🇷","romance"],["Ukraine","🇺🇦","slavic"],["Belarus","🇧🇾","slavic"],["Russland","🇷🇺","slavic"],["Litauen","🇱🇹","slavic"],["Lettland","🇱🇻","slavic"],["Estland","🇪🇪","slavic"],["Georgien","🇬🇪","caucasus"],["Armenien","🇦🇲","caucasus"],["Aserbaidschan","🇦🇿","caucasus"],["Türkei","🇹🇷","caucasus"],["Zypern","🇨🇾","romance"],
["Marokko","🇲🇦","arabic"],["Algerien","🇩🇿","arabic"],["Tunesien","🇹🇳","arabic"],["Libyen","🇱🇾","arabic"],["Ägypten","🇪🇬","arabic"],["Sudan","🇸🇩","arabic"],["Senegal","🇸🇳","african"],["Mali","🇲🇱","african"],["Guinea","🇬🇳","african"],["Gambia","🇬🇲","african"],["Mauretanien","🇲🇷","african"],["Elfenbeinküste","🇨🇮","african"],["Ghana","🇬🇭","african"],["Togo","🇹🇬","african"],["Benin","🇧🇯","african"],["Burkina Faso","🇧🇫","african"],["Nigeria","🇳🇬","african"],["Kamerun","🇨🇲","african"],["Gabun","🇬🇦","african"],["Kongo","🇨🇬","african"],["DR Kongo","🇨🇩","african"],["Angola","🇦🇴","african"],["Sambia","🇿🇲","african"],["Simbabwe","🇿🇼","african"],["Mosambik","🇲🇿","african"],["Südafrika","🇿🇦","african"],["Namibia","🇳🇦","african"],["Botswana","🇧🇼","african"],["Kenia","🇰🇪","african"],["Uganda","🇺🇬","african"],["Tansania","🇹🇿","african"],["Ruanda","🇷🇼","african"],["Äthiopien","🇪🇹","african"],["Eritrea","🇪🇷","african"],["Somalia","🇸🇴","arabic"],["Madagaskar","🇲🇬","african"],["Kap Verde","🇨🇻","romance"],
["Saudi-Arabien","🇸🇦","arabic"],["VAE","🇦🇪","arabic"],["Katar","🇶🇦","arabic"],["Kuwait","🇰🇼","arabic"],["Oman","🇴🇲","arabic"],["Bahrain","🇧🇭","arabic"],["Jordanien","🇯🇴","arabic"],["Libanon","🇱🇧","arabic"],["Syrien","🇸🇾","arabic"],["Irak","🇮🇶","arabic"],["Iran","🇮🇷","caucasus"],["Israel","🇮🇱","arabic"],["Palästina","🇵🇸","arabic"],["Kasachstan","🇰🇿","caucasus"],["Usbekistan","🇺🇿","caucasus"],["Kirgisistan","🇰🇬","caucasus"],["Tadschikistan","🇹🇯","caucasus"],["Turkmenistan","🇹🇲","caucasus"],["Afghanistan","🇦🇫","southasia"],["Pakistan","🇵🇰","southasia"],["Indien","🇮🇳","southasia"],["Bangladesch","🇧🇩","southasia"],["Sri Lanka","🇱🇰","southasia"],["Nepal","🇳🇵","southasia"],
["China","🇨🇳","eastasia"],["Japan","🇯🇵","eastasia"],["Südkorea","🇰🇷","eastasia"],["Nordkorea","🇰🇵","eastasia"],["Mongolei","🇲🇳","caucasus"],["Thailand","🇹🇭","southeastasia"],["Vietnam","🇻🇳","southeastasia"],["Malaysia","🇲🇾","southeastasia"],["Singapur","🇸🇬","southeastasia"],["Indonesien","🇮🇩","southeastasia"],["Philippinen","🇵🇭","southeastasia"],["Myanmar","🇲🇲","southeastasia"],["Kambodscha","🇰🇭","southeastasia"],["Laos","🇱🇦","southeastasia"],
["Australien","🇦🇺","germanic"],["Neuseeland","🇳🇿","pacific"],["Fidschi","🇫🇯","pacific"],["Samoa","🇼🇸","pacific"],["Tonga","🇹🇴","pacific"],["Papua-Neuguinea","🇵🇬","pacific"],
["USA","🇺🇸","americas"],["Kanada","🇨🇦","americas"],["Mexiko","🇲🇽","romance"],["Costa Rica","🇨🇷","romance"],["Panama","🇵🇦","romance"],["Honduras","🇭🇳","romance"],["Guatemala","🇬🇹","romance"],["El Salvador","🇸🇻","romance"],["Nicaragua","🇳🇮","romance"],["Jamaika","🇯🇲","americas"],["Trinidad und Tobago","🇹🇹","americas"],["Kuba","🇨🇺","romance"],["Haiti","🇭🇹","romance"],["Dominikanische Republik","🇩🇴","romance"],
["Brasilien","🇧🇷","romance"],["Argentinien","🇦🇷","romance"],["Uruguay","🇺🇾","romance"],["Paraguay","🇵🇾","romance"],["Chile","🇨🇱","romance"],["Peru","🇵🇪","romance"],["Bolivien","🇧🇴","romance"],["Kolumbien","🇨🇴","romance"],["Ecuador","🇪🇨","romance"],["Venezuela","🇻🇪","romance"],["Guyana","🇬🇾","americas"],["Suriname","🇸🇷","germanic"]
];

export const COUNTRIES=COUNTRY_ROWS.map(([name,flag,region])=>({name,flag,region}));
export const POSITIONS=["TW","IV","LV","RV","ZDM","ZM","LM","RM","ZOM","LA","RA","ST"];

export const POSITION_ALIASES={
 "GK":"TW","GOALKEEPER":"TW","TORWART":"TW",
 "CB":"IV","LCB":"IV","RCB":"IV","CENTERBACK":"IV","CENTREBACK":"IV","INNENVERTEIDIGER":"IV",
 "LB":"LV","LWB":"LV","LEFTBACK":"LV","LINKSVERTEIDIGER":"LV",
 "RB":"RV","RWB":"RV","RIGHTBACK":"RV","RECHTSVERTEIDIGER":"RV",
 "CDM":"ZDM","DM":"ZDM","DEFENSIVEMIDFIELD":"ZDM",
 "CM":"ZM","CENTRALMIDFIELD":"ZM",
 "CAM":"ZOM","AM":"ZOM","OFFENSIVEMIDFIELD":"ZOM",
 "LM":"LM","LEFTMIDFIELD":"LM",
 "RM":"RM","RIGHTMIDFIELD":"RM",
 "LW":"LA","LF":"LA","LEFTWING":"LA",
 "RW":"RA","RF":"RA","RIGHTWING":"RA",
 "CF":"ST","SS":"ST","MS":"ST","STRIKER":"ST","FORWARD":"ST"
};
export function normalizePosition(value){
 const raw=String(value||"").trim().toUpperCase().replace(/[\s._-]+/g,"");
 if(POSITIONS.includes(raw))return raw;
 return POSITION_ALIASES[raw]||"ZM";
}


function pick(arr,rng=Math.random){return arr[Math.floor(rng()*arr.length)]}
function weightedPosition(rng=Math.random){
 const pool=["TW","IV","IV","IV","LV","RV","ZDM","ZDM","ZM","ZM","ZM","LM","RM","ZOM","ZOM","LA","RA","ST","ST","ST"];
 return pick(pool,rng);
}
function marketValue(rating,age,potential){
 const ageFactor=age<=21?1.32:age<=25?1.15:age<=29?1:age<=32?.72:.43;
 const potentialFactor=1+Math.max(0,potential-rating)*.035;
 return Math.max(50000,Math.round((rating**3)*110*ageFactor*potentialFactor/50000)*50000);
}
function attributesFor(position,rating,rng=Math.random){
 const spread=()=>Math.max(25,Math.min(99,Math.round(rating+(rng()-.5)*18)));
 const a={pace:spread(),shooting:spread(),passing:spread(),dribbling:spread(),defending:spread(),physical:spread()};
 if(position==="TW"){a.defending=Math.min(99,rating+5);a.shooting=Math.max(20,rating-35)}
 if(["IV","LV","RV","ZDM"].includes(position))a.defending=Math.min(99,Math.round(rating+4+rng()*5));
 if(["ST","LA","RA","ZOM"].includes(position))a.shooting=Math.min(99,Math.round(rating+2+rng()*6));
 return a;
}

const COUNTRY_NAME_PROFILES={
"de":{first:["Lukas","Jonas","Leon","Finn","Jannik","Moritz","Timo","Nils","Florian","Fabian","Marlon","Levin","Joris","Hannes","Till","Kilian"],prefix:["Aben","Berg","Brand","Eichen","Falk","Feld","Hart","Kron","Linden","Rein","Rosen","Schön","Stein","Wald","Winter","Wolf","Zorn"],suffix:["bach","berg","born","feld","hardt","heim","hoff","kamp","mann","meyer","ner","rich","stein","wald","witz"]},
"at":{first:["Lukas","Florian","Matthias","Dominik","Philipp","Sebastian","Fabian","Tobias","Jakob","Simon","Valentin","Lorenz"],prefix:["Auer","Bach","Brand","Eder","Fuchs","Gruber","Hinter","Hofer","Leit","Mayr","Moser","Pichl","Reiter","Stein","Wimmer"],suffix:["auer","berger","bichler","egger","hofer","inger","leitner","maier","mayr","moser","reiter","thaler"]},
"ch":{first:["Luca","Noah","Nico","Janis","Silvan","Leandro","Loris","Yannick","Dario","Fabian","Sandro","Ramon"],prefix:["Aebi","Bach","Bieri","Brun","Frei","Graf","Huber","Keller","Meier","Moser","Roth","Schmid","Stadel","Zürch"],suffix:["acher","bühl","egger","er","i","lin","mann","matter","moser","schmid","stein","wyss"]},
"nl":{first:["Daan","Sem","Bram","Thijs","Joris","Wout","Niels","Koen","Jelle","Sjoerd","Jens","Mats"],prefix:["Aal","Bakker","Bos","De","Dijk","Hof","Kamp","Meer","Mulder","Smit","Van","Ver","Vis","Vos"],suffix:["beek","berg","boer","broek","dam","dijk","donk","hoven","kamp","meer","stra","veen","veld","wijk"]},
"be":{first:["Louis","Jules","Arthur","Noah","Mathis","Milan","Lars","Seppe","Wout","Thibault","Ruben","Baptiste"],prefix:["Claes","De","Del","Dup","Lam","Le","Maes","Peeters","Van","Ver","Willem","Vanden"],suffix:["aert","bergh","boeck","broeck","court","haeghe","laere","loo","mans","mont","steen","velde"]},
"lu":{first:["Luc","Pit","Tom","Ben","Mathis","Max","Nicolas","Yann","Joël","Michel"],prefix:["Bettel","Faber","Greis","Hoff","Kieffer","Klein","Muller","Schmit","Theis","Weber"],suffix:["er","ert","mann","meyer","rich","schmit","sen","weiler"]},
"dk":{first:["Mikkel","Frederik","Rasmus","Mads","Nikolaj","Lasse","Kasper","Emil","Søren","Magnus"],prefix:["Ander","Christen","Jørgen","Kristen","Lars","Mikkel","Niel","Peter","Rasmus","Søren"],suffix:["sen","gaard","holm","lund","berg","dal","rup","toft"]},
"se":{first:["Viktor","Erik","Emil","Oscar","Anton","Ludwig","Isak","Albin","Axel","Gustav","Hugo","Elias"],prefix:["Ahl","Berg","Dahl","Ek","Falk","Gran","Holm","Lind","Nord","Ny","Sand","Sjö","Sten","Ström"],suffix:["berg","blad","gren","holm","lund","mark","qvist","stedt","ström","vall","vik"]},
"no":{first:["Erik","Sindre","Marius","Henrik","Eirik","Magnus","Håkon","Even","Tobias","Fredrik"],prefix:["Aas","Berg","Dahl","Fjord","Hau","Holm","Lund","Mo","Nord","Ravn","Sol","Vik"],suffix:["bø","dal","gaard","heim","land","moen","sen","stad","strand","vik"]},
"fi":{first:["Eetu","Mikael","Onni","Aleksi","Joonas","Ville","Lauri","Samu","Matias","Tuomas"],prefix:["Aho","Haapa","Haka","Järvi","Kallio","Kivi","Koivu","Lahti","Lehto","Mäki","Niemi","Ranta","Salo"],suffix:["la","lä","nen","niemi","oja","pää","saari","salmi","talo","vaara"]},
"is":{first:["Jón","Aron","Einar","Bjarni","Gísli","Ólafur","Ragnar","Sverrir","Viktor","Hákon"],prefix:["Arnar","Baldur","Einar","Gunnar","Harald","Jón","Kristján","Magnús","Ólaf","Sigur"],suffix:["son","sson"]},
"en":{first:["Jack","Harry","Oliver","George","Charlie","James","Thomas","Ben","Luke","Mason","Archie","Alfie"],prefix:["Ash","Black","Brook","Clarke","Fair","Green","Hart","North","Oak","Reed","Stone","West","White","Wood"],suffix:["brook","field","ford","ham","ley","man","more","ridge","son","ton","well","wood","worth"]},
"sco":{first:["Callum","Finlay","Euan","Fraser","Rory","Hamish","Alistair","Duncan","Craig","Ross","Kieran","Cameron"],prefix:["Aber","Cairn","Craig","Dun","Ferg","Glen","Inver","Kerr","Mac","Mc","Muir","Ross","Strath"],suffix:["aird","bane","burn","ell","ern","ford","gan","ie","land","leod","more","nish","och","rick","ton"]},
"wal":{first:["Rhys","Dafydd","Owain","Iwan","Gethin","Ieuan","Cai","Tomos","Osian","Bryn"],prefix:["Aber","Bryn","Cad","Carad","Glyn","Griff","Llew","Mer","Pen","Pow","Rhys","Tref"],suffix:["ant","dd","ell","eth","ford","gan","ith","ley","lin","wyn","ydd"]},
"irl":{first:["Sean","Conor","Cian","Eoin","Darragh","Oisín","Ronan","Niall","Ciarán","Fionn"],prefix:["Bren","Calla","Dono","Fitz","Gall","Kear","Kelly","Mac","Mc","Mur","O'","Quin","Sulli"],suffix:["an","arty","avan","ey","gan","ley","more","phy","van","y"]},
"nir":{first:["Conor","Ronan","Ciaran","Niall","Sean","Patrick","Jamie","Kyle","Ross","Callum"],prefix:["Camp","Car","Dev","Doh","Ham","Hugh","Mac","Mc","Murray","O'","Quinn"],suffix:["bell","erty","gan","ilton","ley","lin","more","phy","son"]},
"fr":{first:["Lucas","Hugo","Louis","Nathan","Jules","Théo","Antoine","Mathis","Clément","Baptiste","Maxime","Romain"],prefix:["Beau","Bel","Char","Du","Font","Gir","Lac","Lam","Le","Mar","Mont","More","Petit","Riv","Val"],suffix:["ard","ault","eau","el","et","ier","in","on","ot","oux","ville"]},
"es":{first:["Alejandro","Daniel","Pablo","Álvaro","Javier","Sergio","Diego","Hugo","Adrián","Mario","Iker","Rubén"],prefix:["Alba","Castro","Del","Escu","Fern","Gar","Mar","Mend","Mont","Nav","Riv","Sal","Val"],suffix:["ado","ales","ano","ez","ía","illa","ino","ón","ero","es","oza"]},
"cat":{first:["Arnau","Pau","Marc","Jordi","Oriol","Pol","Aleix","Biel","Nil","Gerard"],prefix:["Bell","Castell","Ferrer","Font","Mas","Mont","Puj","Rib","Rov","Serra"],suffix:["ach","al","ell","er","és","et","ol","ons","ra","rell"]},
"pt":{first:["João","Tiago","Miguel","Diogo","Rafael","Gonçalo","André","Pedro","Bruno","Tomás"],prefix:["Alv","Carv","Cost","Fern","Ferre","Gonçalv","Marqu","Mend","More","Pere","Rodrig","Silv"],suffix:["ães","al","eiro","eira","es","im","inho","os","ues","a"]},
"it":{first:["Luca","Marco","Matteo","Alessandro","Andrea","Francesco","Federico","Davide","Lorenzo","Simone"],prefix:["Bell","Bian","Col","Cont","Ferr","Lomb","Manc","Mar","More","Ric","Rom","Ross"],suffix:["ani","ano","ardi","elli","etti","ini","ino","oni","ucci","i"]},
"mt":{first:["Matthew","Luke","Daniel","Joseph","Karl","Jake","Nathan","Mark","Aidan","Liam"],prefix:["Agius","Borg","Butti","Cam","Farr","Gatt","Mical","Scerri","Vella","Zammit"],suffix:["an","ari","eri","ia","ini","it","one","ri"]},
"ro":{first:["Andrei","Mihai","Alexandru","Vlad","Radu","Ionuț","Cristian","Rareș","Ștefan","Florin"],prefix:["Alb","Băl","Cern","Dum","Iones","Marin","Mold","Pop","Răd","Stan","Stoic","Tudor"],suffix:["a","an","aru","eanu","escu","ică","oiu","u"]},
"md":{first:["Ion","Andrei","Mihai","Vasile","Alexandru","Victor","Sergiu","Nicolae","Dumitru","Radu"],prefix:["Balan","Ceban","Cojoc","Grosu","Lupu","Muntean","Rusu","Spînu","Țurcan","Vîr"],suffix:["aru","ciuc","eanu","enco","escu","ov","u"]},
"pl":{first:["Jakub","Kacper","Mateusz","Piotr","Michał","Szymon","Bartosz","Tomasz","Kamil","Wojciech"],prefix:["Biel","Dąbr","Jank","Kowal","Kozł","Kraw","Lewand","Now","Szyman","Wiśn","Wojciech","Ziel"],suffix:["ak","czyk","ecki","ewicz","ik","inski","owski","ski","wicz","yński"]},
"cz":{first:["Jakub","Jan","Tomáš","Petr","Martin","Lukáš","Matěj","Ondřej","David","Adam"],prefix:["Bene","Čern","Dvoř","Hor","Jel","Krej","Král","Nov","Proch","Svob","Vesel"],suffix:["ák","ec","ek","ík","ka","ný","ovský","ský"]},
"sk":{first:["Jakub","Martin","Tomáš","Michal","Samuel","Filip","Lukáš","Adam","Patrik","Marek"],prefix:["Barto","Hud","Ková","Kraj","Nov","Pol","Šim","Tóth","Varg","Vesel"],suffix:["č","ák","ec","ík","ko","ský","ovič"]},
"hu":{first:["Bence","Dániel","Ádám","Máté","Gergő","Balázs","Zoltán","Levente","Tamás","Dominik"],prefix:["Bal","Fark","Hor","Kiss","Kov","Lak","Nagy","Papp","Szal","Tóth","Varg"],suffix:["ai","as","fi","i","os","si","vári"]},
"si":{first:["Luka","Jan","Žan","Miha","Tilen","Jure","Rok","Nejc","Andraž","Matic"],prefix:["Biz","Dol","Klan","Koc","Kos","Krajn","Mlakar","Nov","Potoč","Vid"],suffix:["ar","ec","ič","nik","šek","šič"]},
"hr":{first:["Luka","Ivan","Marko","Matej","Filip","Josip","Ante","Dino","Nikola","Stjepan"],prefix:["Bari","Blaže","Boži","Juri","Kova","Lovri","Mari","Pav","Šari","Vuko"],suffix:["ć","ić","ević","ović"]},
"ba":{first:["Amar","Adnan","Haris","Edin","Mirza","Emir","Kenan","Anel","Tarik","Nermin"],prefix:["Begi","Dedi","Hasi","Hodži","Kadi","Mehi","Osman","Smaji","Sulji","Zuki"],suffix:["ć","ić","ević","ović"]},
"rs":{first:["Nikola","Luka","Marko","Miloš","Stefan","Nemanja","Dušan","Aleksa","Uroš","Vuk"],prefix:["Đorđe","Janko","Kosti","Miloše","Nikoli","Pavlo","Petro","Stojano","Vasi","Živko"],suffix:["ić","ević","ović"]},
"me":{first:["Nikola","Marko","Stefan","Luka","Miloš","Vasilije","Petar","Jovan","Balša","Andrija"],prefix:["Bulat","Đuro","Jovano","Kneže","Maro","Mijuško","Popo","Radulo","Vuko"],suffix:["vić","ić","ević","ović"]},
"mk":{first:["Aleksandar","Stefan","Filip","Nikola","Darko","Bojan","Martin","Ilija","Kristijan","Goran"],prefix:["Angel","Dimitr","Georgi","Iliev","Nikol","Pande","Petro","Rist","Stojan","Trajk"],suffix:["ev","evski","ov","ovski","ski"]},
"al":{first:["Ardit","Erion","Altin","Besnik","Florian","Klevis","Lorik","Endri","Gentian","Ilir"],prefix:["Bardh","Berish","Dervish","Gash","Hoxh","Krasniq","Lesh","Sheh","Shkurt","Zek"],suffix:["aj","a","i","iu","olli"]},
"xk":{first:["Arben","Blerim","Dardan","Ermal","Fisnik","Granit","Lirim","Valon","Ylber","Besart"],prefix:["Berish","Bytyq","Gash","Hoxh","Krasniq","Mustaf","Rash","Shal","Thaç","Zek"],suffix:["aj","i","iu","olli"]},
"bg":{first:["Georgi","Ivan","Dimitar","Nikolay","Petar","Martin","Kristiyan","Stanislav","Borislav","Vasil"],prefix:["Dimitr","Georgi","Ivan","Kole","Nikol","Petr","Stoyan","Todor","Vasile","Zlat"],suffix:["ev","in","ov","ski"]},
"gr":{first:["Giorgos","Nikos","Dimitris","Kostas","Alexandros","Andreas","Vasilis","Christos","Panagiotis","Stavros"],prefix:["Alex","Dimitr","Georg","Kara","Konstant","Nikola","Papad","Petr","Stavr","Theo"],suffix:["akis","idis","opoulos","os","ou","oglou"]},
"ua":{first:["Oleksandr","Andriy","Mykola","Taras","Bohdan","Dmytro","Vladyslav","Maksym","Artem","Yaroslav"],prefix:["Bondar","Hryts","Koval","Krav","Lysen","Melny","Petr","Shev","Tkachen","Zakh"],suffix:["chuk","enko","iuk","ko","uk","yuk"]},
"by":{first:["Aliaksandr","Mikalai","Dzmitry","Pavel","Siarhei","Ihar","Andrei","Maksim","Uladzimir","Yauhen"],prefix:["Baran","Bondar","Karp","Koval","Krav","Novik","Pavlo","Sidor","Yaku","Zhuk"],suffix:["au","enka","evich","ich","ik","ovich","ski"]},
"ru":{first:["Aleksandr","Dmitri","Maksim","Artyom","Nikita","Ivan","Mikhail","Kirill","Sergei","Vladislav"],prefix:["Bel","Bogdan","Grom","Ivan","Karp","Kuznets","Lebed","Moroz","Orl","Petrov","Sokol","Volk"],suffix:["ev","in","kin","ov","sky","tsov"]},
"lt":{first:["Mantas","Lukas","Domas","Rokas","Tomas","Karolis","Paulius","Arnas","Vytautas","Mindaugas"],prefix:["Balči","Jankaus","Kazlaus","Petraus","Ramanaus","Stankevi","Urbon","Vasiliaus","Žukaus"],suffix:["aitis","auskas","evičius","inskas","onis","ūnas"]},
"lv":{first:["Jānis","Mārtiņš","Rihards","Kristaps","Edgars","Roberts","Artūrs","Kārlis","Mārcis","Dāvis"],prefix:["Balo","Bērzi","Janso","Kalni","Krūmi","Liepi","Ozoli","Sili","Vīto","Zari"],suffix:["dis","ņš","ns","š","tis"]},
"ee":{first:["Karl","Markus","Rasmus","Martin","Kristjan","Mihkel","Siim","Henri","Rauno","Taavi"],prefix:["Ilves","Järv","Kaas","Kask","Kuus","Lepp","Mets","Pärn","Saar","Sepp","Tamm"],suffix:["ik","la","maa","mets","oja","son","soo","vere"]},
"ge":{first:["Giorgi","Nika","Lasha","Levan","Saba","Tornike","Zurab","Davit","Irakli","Beka"],prefix:["Ber","Gelash","Kapan","Kvarats","Mamu","Mched","Nadira","Tavart","Tsik","Zurab"],suffix:["adze","ashvili","dze","idze","shvili"]},
"am":{first:["Aram","Tigran","Narek","Gor","Hayk","Vahan","Karen","Artur","Levon","Sargis"],prefix:["Avet","Grigor","Hakob","Harut","Karapet","Manuk","Martir","Petros","Sargs"],suffix:["ian","yan"]},
"az":{first:["Ali","Murad","Orkhan","Rashad","Tural","Emin","Kamran","Ramil","Elvin","Nijat"],prefix:["Abdul","Ali","Hasan","Huseyn","Ibrah","Karim","Mammad","Nabi","Quli","Rahim"],suffix:["li","ov","yev","zade"]},
"tr":{first:["Emre","Burak","Kerem","Arda","Hakan","Oğuz","Mert","Can","Kaan","Yusuf"],prefix:["Ak","Ayd","Demir","Doğan","Gül","Kara","Kaya","Koç","Öz","Şahin","Tekin","Yıldız"],suffix:["alp","can","daş","demir","doğan","er","han","kaya","oğlu","soy"]},
"cy":{first:["Andreas","Michalis","Christos","Giorgos","Nikos","Marios","Constantinos","Panayiotis","Kyriakos","Stavros"],prefix:["Andreou","Charalamb","Christod","Georg","Ioann","Kyriak","Micha","Nicola","Panay","Theod"],suffix:["ides","opoulos","os","ou"]},
"ma":{first:["Youssef","Ayoub","Hakim","Rachid","Amine","Mehdi","Othmane","Soufiane","Anas","Ilyas"],prefix:["Ala","Amra","Ben","Bou","El","Hadda","Idrissi","Manso","Oua","Zer"],suffix:["ani","i","oun","oui"]},
"dz":{first:["Riyad","Youcef","Sofiane","Islam","Amine","Nabil","Farid","Mehdi","Walid","Rachid"],prefix:["Abd","Ait","Bel","Ben","Boud","Brah","Cher","Hadd","Mek","Zer"],suffix:["ani","i","ouche","oui"]},
"tn":{first:["Yassine","Aymen","Hamza","Wahbi","Fakhreddine","Naim","Bilel","Anis","Ali","Mohamed"],prefix:["Ben","Bou","Cha","Ghar","Ham","Jeb","Msa","Sassi","Trabel","Zou"],suffix:["ali","ani","i","si"]},
"ly":{first:["Ahmed","Mohamed","Ali","Muftah","Mahmoud","Omar","Anas","Faisal","Hassan","Walid"],prefix:["Abu","Al","El","Gad","Khal","Mabr","Mans","Shal","Zam"],suffix:["ani","i","oun"]},
"eg":{first:["Mohamed","Ahmed","Mahmoud","Omar","Mostafa","Karim","Hassan","Tarek","Amr","Ramadan"],prefix:["Abdel","El","Fath","Heg","Kamel","Mans","Nagu","Ram","Salah","Zaki"],suffix:["allah","awy","i","y"]},
"sd":{first:["Mohamed","Ahmed","Omer","Musa","Yasir","Abdelrahman","Bakri","Hassan","Walid","Ammar"],prefix:["Abdel","El","Ham","Idr","Mahj","Osman","Sidd","Taj","Yag"],suffix:["allah","ani","awi","i"]},
"sn":{first:["Mamadou","Ibrahima","Ousmane","Cheikh","Sadio","Amadou","Moussa","Pape","Ismaïla","Idrissa"],prefix:["Ba","Camara","Ciss","Diallo","Diop","Faye","Gueye","Kane","Ndiaye","Sarr","Sow"],suffix:["a","ane","é","i","o","ou"]},
"ml":{first:["Adama","Moussa","Amadou","Lassana","Mamadou","Boubacar","Sékou","Modibo","Ibrahim","Yacouba"],prefix:["Bagay","Ciss","Coulib","Diarra","Doumb","Keita","Konaté","Samak","Siss","Traor"],suffix:["a","é","i","o","ou"]},
"gn":{first:["Naby","Amadou","Ibrahima","Mamadou","Sékou","Mory","Abdoulaye","Ousmane","Fodé","Mohamed"],prefix:["Bang","Camara","Condé","Diallo","Keita","Soumah","Sylla","Touré"],suffix:["a","é","i","o","ou"]},
"gm":{first:["Lamin","Modou","Ebrima","Musa","Ousman","Sulayman","Babucarr","Momodou","Alieu","Pa"],prefix:["Bah","Ceesay","Darboe","Jallow","Jobarteh","Manneh","Sanyang","Sonko","Touray"],suffix:["a","eh","ey","o"]},
"mr":{first:["Abdallahi","Mohamed","Cheikh","Mamadou","Brahim","Sidi","Yacoub","Ahmed","El Hacen","Ismail"],prefix:["Ba","Diop","Fall","Kane","Mint","Ould","Sow","Sy"],suffix:["ah","ani","i","ou"]},
"ci":{first:["Didier","Wilfried","Franck","Serge","Maxwel","Sébastien","Jean","Kouadio","Yannick","Oumar"],prefix:["Aka","Bamba","Boli","Coulib","Drog","Gbamin","Kessi","Konan","Kouam","Zok"],suffix:["a","é","i","o","ou"]},
"gh":{first:["Kwame","Kofi","Yaw","Kojo","Asamoah","Daniel","Mohammed","Ibrahim","Emmanuel","Richmond"],prefix:["Aboagye","Addo","Agye","Asare","Boateng","Frimpong","Mensah","Ofori","Owusu","Yeboah"],suffix:["ah","e","i","o"]},
"tg":{first:["Kodjo","Kossi","Komlan","Djené","Emmanuel","Alaixys","Ihlas","Mawouna","Floyd","Samuel"],prefix:["Adeg","Akak","Amouz","Atak","Ayité","Bebou","Dossevi","Gakpé","Romao"],suffix:["a","é","i","o","ou"]},
"bj":{first:["Stéphane","Steve","Jodel","Sessi","Mickaël","David","Jordan","Cédric","Saturnin","Marcellin"],prefix:["Adj","Adén","Ahou","Doss","Kiki","Moun","Sèss","Souk","Verdon"],suffix:["a","é","i","o","ou"]},
"bf":{first:["Bertrand","Issoufou","Dango","Edmond","Hervé","Steeve","Abdoul","Adama","Lassina","Blati"],prefix:["Bande","Dabiré","Kaboré","Konaté","Ouattara","Ouédraogo","Sangaré","Sawadogo","Tapsoba","Traoré"],suffix:["a","é","i","o","ou"]},
"ng":{first:["Chinedu","Emeka","Tunde","Ayodele","Victor","Samuel","Kelechi","Wilfred","Moses","Taiwo"],prefix:["Ade","Aina","Akp","Balogun","Eze","Igh","Ihean","Musa","Ndidi","Nw","Okafor","Oko"],suffix:["bi","de","eke","i","na","ru","wo"]},
"cm":{first:["Samuel","André","Eric","Vincent","Karl","Christian","Fabrice","Jean","Clinton","Bryan"],prefix:["Abou","Bass","Choupo","Eto","Fai","Kunde","Mba","Moumi","Nkoul","Onana","Toko"],suffix:["a","é","i","o","ou"]},
"ga":{first:["Pierre","Denis","Mario","Bruno","Didier","Aaron","Guelor","André","Axel","Jim"],prefix:["Aubame","Bou","Ecuele","Kanga","Lemina","Manga","Moungu","N'Dong","Obiang"],suffix:["a","é","i","o","ou"]},
"cg":{first:["Thievy","Delvin","Prince","Silvère","Mavis","Férébory","Arnold","Bradley","Béni","Durel"],prefix:["Bifouma","Delaine","Hountondji","Makouta","Mbenza","Ndinga","Nkou","Nzonzi","Ondama"],suffix:["a","é","i","o","ou"]},
"cd":{first:["Cédric","Chancel","Gaël","Arthur","Dieumerci","Yannick","Meschack","Samuel","Jonathan","Yoane"],prefix:["Bakambu","Bolasie","Kakuta","Kebano","Luyindama","Mbemba","Mpoku","Muleka","Wissa"],suffix:["a","é","i","o","ou"]},
"ao":{first:["Gelson","Mateus","Mabululu","Fredy","Bastos","Djalma","Wilson","Ary","Clinton","Zito"],prefix:["Afonso","Bunga","Costa","Domingos","Fortunato","Gaspar","Manuel","Massanga","Mendes"],suffix:["a","es","o","os"]},
"zm":{first:["Patson","Fashion","Enock","Stopilla","Lameck","Clatous","Lubambo","Kings","Evans","Emmanuel"],prefix:["Banda","Daka","Kangwa","Mwepu","Musonda","Sakala","Sinkala","Sunzu","Tembo"],suffix:["a","i","o"]},
"zw":{first:["Knowledge","Marvelous","Tino","Teenage","Khama","Kudakwashe","Marshall","Prince","Onismor","Ronald"],prefix:["Billiat","Hadebe","Kadewere","Mahachi","Munyonga","Musona","Nakamba","Rusike","Zemura"],suffix:["a","e","i","o"]},
"mz":{first:["Geny","Reinildo","Domingues","Witi","Mexer","Clésio","Stanley","Gildo","Telinho","Daylon"],prefix:["Amade","Bauque","Catamo","Domingos","Langa","Macandza","Magaia","Mandava","Miquissone"],suffix:["a","es","o"]},
"za":{first:["Thabo","Sipho","Bongani","Lethabo","Themba","Siyabonga","Kagiso","Teboho","Percy","Lyle"],prefix:["Dlamini","Khumalo","Mahlangu","Mokoena","Molefe","Mthembu","Ndlovu","Nkosi","Pietersen","Van Wyk"],suffix:["a","e","i","o"]},
"na":{first:["Peter","Deon","Dynamo","Ryan","Prins","Ananias","Willy","Benson","Marcel","Junior"],prefix:["Gebhardt","Hotto","Katjiteo","Kavendjii","Ketjijere","Nyambe","Shitembi","Starke"],suffix:["a","e","i","o"]},
"bw":{first:["Mogakolodi","Segolame","Thatayaone","Thabang","Gape","Kabelo","Tumisang","Tshepang","Onkabetse","Lesego"],prefix:["Bikoko","Gabonamong","Gaolaolwe","Kebue","Mogorosi","Moloi","Ngele","Seakanyeng"],suffix:["a","e","i","o"]},
"ke":{first:["Michael","Victor","Joseph","Eric","Ayub","Brian","Collins","David","John","Samuel"],prefix:["Akumu","Kahata","Masika","Muguna","Odhiambo","Oliech","Omondi","Onyango","Wanyama"],suffix:["a","e","i","o"]},
"ug":{first:["Farouk","Emmanuel","Khalid","Taddeo","Milton","Geoffrey","Moses","Ibrahim","Patrick","Allan"],prefix:["Aucho","Kizito","Luwagga","Miya","Mugabi","Nsibambi","Ochaya","Okwi","Wasswa"],suffix:["a","e","i","o"]},
"tz":{first:["Mbwana","Simon","Feisal","Himid","Erasto","John","Shomari","Novatus","Kelvin","Aishi"],prefix:["Bocco","Kapombe","Manula","Msuva","Nondo","Nyoni","Samata","Ulimwengu"],suffix:["a","e","i","o"]},
"rw":{first:["Olivier","Jacques","Djihad","Kevin","Yannick","Muhadjiri","Fitina","Haruna","Emery","Thierry"],prefix:["Bizimana","Hakizimana","Imanishimwe","Kagere","Manzi","Mugisha","Niyonzima","Rwatubyaye"],suffix:["a","e","i","o"]},
"et":{first:["Abel","Getaneh","Gatoch","Shimelis","Surafel","Amanuel","Bereket","Dawit","Mesud","Yared"],prefix:["Abate","Bekele","Desta","Gebre","Kebede","Tadesse","Tesfaye","Yohannes"],suffix:["a","e","i","o"]},
"er":{first:["Henok","Ali","Yonas","Robel","Sium","Amanuel","Abraham","Isaias","Natnael","Samuel"],prefix:["Abraha","Fessahaye","Gebremedhin","Goitom","Ogbazghi","Russom","Tesfagiorgis"],suffix:["a","e","i","o"]},
"so":{first:["Omar","Abdi","Ahmed","Hassan","Mohamed","Ismail","Ali","Yusuf","Abdullahi","Zakaria"],prefix:["Abdi","Ali","Farah","Hassan","Mohamed","Nur","Osman","Warsame","Yusuf"],suffix:["ahi","an","i","le"]},
"mg":{first:["Faneva","Ima","Lalaina","Ando","Dax","Rayan","Njiva","Marco","Loïc","Toky"],prefix:["Andrian","Bapasy","Fontaine","Ilaimaharitra","Métanire","Mombris","Raveloson","Razakanantenaina"],suffix:["a","e","i","o"]},
"cv":{first:["Ryan","Jovane","Garry","Djaniny","Kenny","Jamiro","Lisandro","Nuno","Ricardo","Steven"],prefix:["Bebé","Cabral","Fortes","Lopes","Mendes","Monteiro","Pereira","Rodrigues","Semedo","Tavares"],suffix:["a","es","o"]},
"sa":{first:["Salem","Fahad","Yasser","Abdullah","Mohammed","Nawaf","Sultan","Saud","Hattan","Ali"],prefix:["Al","Abd","Daws","Gham","Ham","Harb","Muw","Qaht","Shahr","Sheh"],suffix:["ani","i","iri"]},
"ae":{first:["Ali","Omar","Ahmed","Khalil","Hassan","Mohamed","Walid","Tariq","Majed","Yousef"],prefix:["Abbas","Al","Hammadi","Hashemi","Mansouri","Mazrouei","Nuaimi","Shamsi"],suffix:["i","ri"]},
"qa":{first:["Akram","Hassan","Almoez","Abdelkarim","Boualem","Tarek","Homam","Ahmed","Mohammed","Yusuf"],prefix:["Abd","Al","Afif","Haydos","Hassan","Khoukhi","Madibo","Muntari"],suffix:["i","ri"]},
"kw":{first:["Bader","Fahad","Yousef","Sultan","Khaled","Mohammed","Ahmed","Hamad","Talal","Faisal"],prefix:["Al","Ansari","Fadhel","Hajri","Khaldi","Mutawa","Rashidi"],suffix:["i","ri"]},
"om":{first:["Ahmed","Abdulaziz","Harib","Jameel","Mohsin","Salah","Khalid","Faiyz","Arshad","Issam"],prefix:["Al","Busaidi","Habsi","Khaldi","Mukhaini","Mushaifri","Rawahi"],suffix:["i","ri"]},
"bh":{first:["Sayed","Mohamed","Kamil","Ali","Abdulla","Mahdi","Husain","Ismail","Jasim","Ahmed"],prefix:["Abbas","Al","Aswad","Humaidan","Marhoon","Rumaithi"],suffix:["i","ri"]},
"jo":{first:["Musa","Yazan","Baha","Hamza","Mahmoud","Anas","Yousef","Ibrahim","Ahmad","Nizar"],prefix:["Abu","Al","Bani","Mardi","Naimat","Rawashdeh","Shatnawi"],suffix:["i","ri"]},
"lb":{first:["Hassan","Hussein","Mohamad","Abbas","Ali","Hilal","Nader","Rabih","Waleed","Rami"],prefix:["Atwi","El","Haidar","Kdouh","Maatouk","Melki","Sabra"],suffix:["i","ri"]},
"sy":{first:["Omar","Mahmoud","Mohammad","Ahmad","Khaled","Firas","Aias","Thaer","Mardik","Youssef"],prefix:["Ajan","Al","Khribin","Mawas","Midani","Othman"],suffix:["i","ri"]},
"iq":{first:["Ali","Mohannad","Ahmed","Bashar","Aymen","Hussein","Amjad","Mohanad","Saad","Ibrahim"],prefix:["Abbas","Adnan","Ali","Hammadi","Jabbar","Kadhim","Mohammed","Yasin"],suffix:["i","ri"]},
"ir":{first:["Sardar","Mehdi","Alireza","Ehsan","Saman","Milad","Vahid","Reza","Omid","Karim"],prefix:["Azmoun","Ebrahimi","Ghaedi","Hosseini","Jahanbakhsh","Karimi","Mohammadi","Nourollahi"],suffix:["i","ian","pour","zadeh"]},
"il":{first:["Daniel","Eran","Dor","Lior","Omer","Manor","Gadi","Neta","Eli","Yarden"],prefix:["Abada","Biton","Cohen","Dasa","Glazer","Kane","Levi","Peretz","Solomon","Tibi"],suffix:["i","man","on","stein"]},
"ps":{first:["Oday","Tamer","Mahmoud","Mohammed","Saleh","Yaser","Alaa","Musab","Sameh","Islam"],prefix:["Abu","Al","Dabbagh","Hamed","Jaber","Qunbar","Seyam"],suffix:["i","ri"]},
"kz":{first:["Bakhtiyor","Abat","Askhat","Bauyrzhan","Islambek","Serikzhan","Yan","Georgy","Nuraly","Ramazan"],prefix:["Aimbet","Alip","Baltabek","Kuat","Maliy","Nurgali","Suyumbay","Zaynutdin"],suffix:["ov","uly","yev"]},
"uz":{first:["Eldor","Jaloliddin","Odil","Otabek","Azizbek","Doston","Igor","Jamshid","Sardor","Sherzod"],prefix:["Abdurahmon","Ahmed","Khamdam","Masharip","Rashid","Shomurod","Turgun","Yusup"],suffix:["ov","yev","zoda"]},
"kg":{first:["Mirlan","Valeriy","Gulzhigit","Kayrat","Bekzhan","Alimardon","Erbol","Odilzhon","Akram","Rustam"],prefix:["Alykul","Bernhardt","Kichin","Murzay","Shukurov","Zhyrgalbek"],suffix:["ov","uulu","yev"]},
"tj":{first:["Parvizdzhon","Ehson","Manuchekhr","Rustam","Akhtam","Alisher","Komron","Mukhammadzhon","Shervoni","Amadoni"],prefix:["Dzhuraboev","Khamroqulov","Panjshanbe","Rahimov","Safarov","Soiev"],suffix:["ov","yev","zoda"]},
"tm":{first:["Arslanmyrat","Altymyrat","Serdar","Vahyt","Mekan","Ruslan","Süleýman","Dovlet","Myrat","Didar"],prefix:["Annadurdy","Atayev","Bashim","Geldiyev","Hojov","Mingazov"],suffix:["ov","yev"]},
"af":{first:["Faysal","Zubayr","Farshad","Omid","Noor","Mustafa","Amir","Haroon","Ahmad","Sayed"],prefix:["Ahmadi","Akbari","Haidari","Hosseini","Mohammadi","Noorzai","Rahimi","Yousufi"],suffix:["i","zai"]},
"pk":{first:["Hassan","Muhammad","Ali","Ahmed","Bilal","Faisal","Kaleem","Rizwan","Saad","Usman"],prefix:["Ahmed","Akhtar","Ali","Iqbal","Khan","Malik","Qureshi","Raza","Shah"],suffix:["i","vi"]},
"in":{first:["Arjun","Rohan","Vikram","Ayaan","Kabir","Ishaan","Rahul","Dev","Aditya","Sameer"],prefix:["Bose","Chandra","Das","Kapoor","Kumar","Mehta","Nair","Patel","Rao","Sharma","Singh","Verma"],suffix:["an","ar","i","kar","nath"]},
"bd":{first:["Jamal","Rakib","Topu","Sohel","Biplu","Mohammad","Saad","Rahmat","Rimon","Yeasin"],prefix:["Ahmed","Bhuyan","Hossain","Islam","Miah","Rahman","Rana","Uddin"],suffix:["i","ur"]},
"lk":{first:["Nimal","Dinesh","Kasun","Lahiru","Charitha","Danushka","Kavindu","Asela","Chamara","Supun"],prefix:["Bandara","Fernando","Jayasinghe","Perera","Rajapaksa","Silva","Wijesinghe"],suffix:["a","e","i"]},
"np":{first:["Bimal","Anjan","Kiran","Rohit","Bishal","Nawayug","Sujal","Arik","Ayush","Manish"],prefix:["Bista","Gurung","Khadka","Lama","Rai","Shrestha","Tamang","Thapa"],suffix:["a","i"]},
"cn":{first:["Wei","Jun","Hao","Tao","Jian","Ming","Chen","Yichen","Zixuan","Haoran"],prefix:["Bai","Chen","Gao","Huang","Li","Lin","Liu","Sun","Wang","Wu","Yang","Zhang","Zhao"],suffix:["ang","eng","ian","in","ong","un"]},
"jp":{first:["Haruto","Riku","Yuto","Kaito","Ren","Daichi","Takumi","Sota","Ryota","Kenta"],prefix:["Abe","Fuji","Hara","Ishi","Kawa","Kita","Koba","Mori","Naka","Saka","Shima","Taka","Yama"],suffix:["da","gawa","hara","kawa","ki","moto","mura","oka","saki","shima","ta","yama","zaki"]},
"kr":{first:["Min-jun","Ji-hoon","Seo-jun","Hyun-woo","Jae-sung","Dong-hyun","Sung-min","Tae-hyun","Jun-ho","Woo-young"],prefix:["Choi","Han","Hwang","Jang","Jeong","Kang","Kim","Kwon","Lee","Lim","Park","Seo","Son","Yoon"],suffix:["ho","hun","min","seok","soo","woo"]},
"kp":{first:["Kwang-song","Song-hyok","Kuk-chol","Il-gwan","Yong-jik","Chol-bom","Kum-il","Hyok-chol","Il-song","Kwang-jin"],prefix:["An","Choe","Han","Jang","Kim","Li","Pak","Ri","Ro","Sin"],suffix:["chol","ho","il","song","su"]},
"mn":{first:["Ganbayar","Tsend-Ayush","Mönkh-Erdene","Bilguun","Dulguun","Temuulen","Batbold","Naranbold","Erdenebat","Anar"],prefix:["Bat","Bold","Enkh","Erdene","Gan","Munkh","Naran","Tsend"],suffix:["baatar","bold","dorj","erdene","suren"]},
"th":{first:["Chanathip","Supachok","Suphanat","Theerathon","Teerasil","Kritsada","Sarach","Ekanit","Peeradon","Bordin"],prefix:["Boon","Charoen","Kraisorn","Mueanta","Prom","Sarachat","Songkrasin","Thong","Wong"],suffix:["chai","dee","kul","phan","rak","sin","sri","thong"]},
"vn":{first:["Quang","Minh","Duc","Bao","Tuan","Cong","Van","Tien","Hai","Hoang"],prefix:["Bui","Do","Ho","Hoang","Le","Nguyen","Pham","Phan","Tran","Vu"],suffix:["anh","duc","minh","nam","son"]},
"my":{first:["Safawi","Akhyar","Faisal","Arif","Hakim","Irfan","Azam","Dion","Brendan","Syamer"],prefix:["Ahmad","Azih","Davies","Halim","Hassan","Lok","Rasid","Rosli","Sumareh"],suffix:["i","man"]},
"sg":{first:["Ikhsan","Irfan","Shah","Hafiz","Hariss","Adam","Jacob","Song","Ryhan","Taufik"],prefix:["Abdullah","Fandi","Hamzah","Ishak","Mahler","Ramli","Stewart","Sulaiman"],suffix:["i","man"]},
"id":{first:["Egy","Witan","Pratama","Asnawi","Rizky","Rachmat","Stefano","Marselino","Yakob","Saddil"],prefix:["Arhan","Drajad","Hidayat","Irianto","Kambuaya","Pratama","Ramadhani","Saputra","Sulaeman","Wijaya"],suffix:["a","i","o","wan"]},
"ph":{first:["Stephan","Neil","Patrick","Javier","Mike","Amani","Jefferson","Daisuke","Kevin","Bienvenido"],prefix:["Aguinaldo","Daniels","De Murga","Gayoso","Hartmann","Ingham","Ott","Reichelt","Tabinas"],suffix:["a","ez","o","os"]},
"mm":{first:["Aung","Kyaw","Myo","Soe","Than","Thein","Win","Ye","Zaw","Hein"],prefix:["Aye","Htet","Kyaw","Lin","Min","Naing","Oo","Soe","Tun","Win"],suffix:["a","ing"]},
"kh":{first:["Chan","Sieng","Sos","Prak","Thierry","Keo","Lim","Sin","Mat","Yue"],prefix:["Bunheang","Chanthea","Kouch","Pisoth","Sambath","Sokpheng","Sovan"],suffix:["a","eth"]},
"la":{first:["Billy","Soukaphone","Phoutthasay","Khampheng","Chony","Bounphachan","Anousone","Khonesavanh","Kydavone","Sayfon"],prefix:["Bounkong","Chandalaphone","Kettavong","Phommasone","Sihavong","Vongchiengkham"],suffix:["a","ong"]},
"au":{first:["Liam","Jack","Mathew","Aaron","Riley","Connor","Mitchell","Aiden","Cameron","Jackson"],prefix:["Arnold","Behich","Goodwin","Irvine","Leckie","Metcalfe","Mooy","Rowles","Souttar","Wright"],suffix:["er","ley","man","son","ton"]},
"nz":{first:["Chris","Ryan","Marco","Liberato","Sarpreet","Joe","Matt","Tim","Alex","Callum"],prefix:["Bell","Boxall","Cacace","Just","McCowatt","Reid","Rojas","Singh","Stamenic","Wood"],suffix:["er","ley","son","ton"]},
"fj":{first:["Roy","Setareki","Iosefo","Sairusi","Tevita","Alvin","Remueru","Aporosa","Dave","Shane"],prefix:["Krishna","Kula","Nalaubu","Nath","Naulumatua","Ravulo","Tuivuna","Waqa"],suffix:["a","i"]},
"ws":{first:["Theodore","Pharrell","Darren","Rapahel","Andrew","Silao","Paulo","Sio","Tupuola","Vaa"],prefix:["Faalogo","Fuimaono","Leiataua","Luvu","Poutoa","Saaga","Taufa","Vaai"],suffix:["a","i"]},
"to":{first:["Hemaloto","Kilifi","Sione","Viliami","Atieli","Masiu","Lotima","Kava","Kitione","Aisake"],prefix:["Fakahau","Latu","Maama","Moala","Taufatofua","Vaikona","Vea"],suffix:["a","i"]},
"pg":{first:["Alwin","Raymond","Tommy","Ati","Michael","David","Koriak","Emmanuel","Daniel","Patrick"],prefix:["David","Foster","Gunemba","Komolong","Kua","Muta","Semmy","Wama"],suffix:["a","i"]},
"us":{first:["Tyler","Cameron","Ethan","Mason","Logan","Caleb","Jayden","Brandon","Austin","Dylan"],prefix:["Ash","Black","Brooks","Carter","Cole","Davis","Green","Hall","Johnson","Miller","Reed","Smith","Taylor","Wilson"],suffix:["er","ley","man","son","ton"]},
"ca":{first:["Jonathan","Alphonso","Tajon","Stephen","Liam","Ismaël","Maxime","Samuel","Lucas","Daniel"],prefix:["Adekugbe","Buchanan","David","Davies","Johnston","Larin","Miller","Osorio","Piette","St. Clair"],suffix:["er","ley","man","son","ton"]},
"mx":{first:["Santiago","Diego","Carlos","Luis","Javier","Héctor","Raúl","Uriel","Edson","Jorge"],prefix:["Agui","Arte","Chá","Córd","Guz","Jimé","Loz","Mont","Pined","Rodríg"],suffix:["ado","ales","ez","ía","illo","ón","ero"]},
"cr":{first:["Keylor","Joel","Bryan","Celso","Francisco","Johan","Manfred","Randall","Orlando","Anthony"],prefix:["Borges","Calvo","Campbell","Duarte","Gamboa","Navas","Oviedo","Ruiz","Venegas"],suffix:["ado","es","ez","o"]},
"pa":{first:["Aníbal","Alberto","Édgar","José","Adalberto","Ismael","César","Fidel","Michael","Gabriel"],prefix:["Andrade","Bárcenas","Carrasquilla","Davis","Escobar","Godoy","Murillo","Quintero"],suffix:["ado","es","ez","o"]},
"hn":{first:["Alberth","Anthony","Romell","Maynor","Boniek","Bryan","Kevin","Jerry","Alexander","Jorge"],prefix:["Acosta","Benguché","Elis","Figueroa","Lozano","Najar","Quioto","Rodríguez"],suffix:["ado","es","ez","o"]},
"gt":{first:["Carlos","Marco","José","Óscar","Darwin","Rodrigo","Jorge","Alejandro","Rubio","Gerardo"],prefix:["Aparicio","Cincotta","Galindo","Hagen","Lom","López","Mejía","Robles"],suffix:["ado","es","ez","o"]},
"sv":{first:["Alex","Darwin","Enrico","Jairo","Joaquín","Kevin","Marvin","Nelson","Rodolfo","Roberto"],prefix:["Cerén","Dueñas","Henríquez","Larín","Martínez","Menjívar","Roldán","Tamacas"],suffix:["ado","es","ez","o"]},
"ni":{first:["Juan","Carlos","Luis","Josué","Henry","Ariagner","Byron","Manuel","Oscar","Jaime"],prefix:["Barréra","Chavarría","Coronel","Fletes","López","Maradiaga","Rosales"],suffix:["ado","es","ez","o"]},
"jm":{first:["Leon","Shamar","Bobby","Andre","Damion","Michail","Ravel","Kemar","Javain","Dexter"],prefix:["Antonio","Bailey","Bernard","Blake","Gray","Lowe","Nicholson","Pinnock","Reid"],suffix:["er","ley","man","son","ton"]},
"tt":{first:["Levi","Kevin","Joevin","Ryan","Nathaniel","Duane","Aubrey","Neveal","Noah","Reon"],prefix:["Bateau","García","Hodge","Jones","Levi","Mekeil","Molino","Phillip"],suffix:["er","ley","man","son","ton"]},
"cu":{first:["Onel","Luis","Yasnier","Maykel","Jorge","Arichel","Dariel","Karel","Carlos","Yordan"],prefix:["Hernández","López","Martínez","Paradela","Pérez","Piedra","Reyes","Santos"],suffix:["ado","es","ez","o"]},
"ht":{first:["Duckens","Frantzdy","Carlens","Johny","Ricardo","Derrick","Alex","Bryan","Steeven","Leverton"],prefix:["Antoine","Arcus","Etienne","Guerrier","Lafrance","Pierrot","Placide","Saint-Fleur"],suffix:["e","el","on"]},
"do":{first:["Mariano","Junior","Carlos","Ronaldo","Dorny","Heinz","Jean","Nowend","Miguel","Luiyi"],prefix:["Báez","Cayetano","López","Núñez","Pérez","Reyes","Romero","Vásquez"],suffix:["ado","es","ez","o"]},
"br":{first:["João","Caio","Vinícius","Gabriel","Matheus","Lucas","Rafael","Guilherme","Pedro","Bruno"],prefix:["Alv","Carv","Cost","Ferre","Gonçalv","Lima","Marqu","Nascim","Olive","Pere","Rodrig","Sant"],suffix:["a","ães","eiro","eira","es","inho","os"]},
"ar":{first:["Santiago","Joaquín","Nicolás","Facundo","Agustín","Matías","Lautaro","Thiago","Franco","Valentín"],prefix:["Acost","Benít","Echev","Fernánd","Gimén","López","Molin","Pared","Rom","Sos"],suffix:["a","ez","ini","o","ón","otti"]},
"uy":{first:["Federico","Rodrigo","Facundo","Agustín","Nicolás","Matías","Sebastián","Maximiliano","Giorgian","Brian"],prefix:["Bentancur","Cáceres","Coates","De Arrascaeta","Giménez","Godín","Nández","Olivera","Rochet","Suárez"],suffix:["a","ez","o"]},
"py":{first:["Miguel","Ángel","Gustavo","Derlis","Antonio","Óscar","Richard","Matías","Fabián","Hernán"],prefix:["Almirón","Balbuena","Gómez","González","Martínez","Ortiz","Rojas","Romero","Sanabria"],suffix:["a","ez","o"]},
"cl":{first:["Alexis","Arturo","Ben","Claudio","Charles","Diego","Erick","Gary","Marcelino","Paulo"],prefix:["Aránguiz","Bravo","Díaz","Isla","Maripán","Medel","Pulgar","Sánchez","Vargas","Vidal"],suffix:["a","ez","o"]},
"pe":{first:["André","Christian","Edison","Gianluca","Luis","Pedro","Renato","Sergio","Yoshimar","Paolo"],prefix:["Advíncula","Aquino","Carrillo","Cueva","Flores","Guerrero","Tapia","Trauco","Yotún"],suffix:["a","ez","o"]},
"bo":{first:["Marcelo","Carlos","Erwin","Ramiro","Leonel","Víctor","Boris","Jaume","Henry","Bruno"],prefix:["Bejarano","Chumacero","Fernández","Haquín","Lampe","Martins","Moreno","Saucedo"],suffix:["a","ez","o"]},
"co":{first:["James","Luis","Juan","Davinson","Duván","Rafael","Yerry","Wilmar","Jefferson","Jhon"],prefix:["Borré","Cuadrado","Díaz","Falcao","Mina","Muriel","Ospina","Sánchez","Uribe","Zapata"],suffix:["a","ez","o"]},
"ec":{first:["Enner","Ángel","Moisés","Pervis","Gonzalo","Carlos","Félix","Alan","Michael","Jeremy"],prefix:["Caicedo","Cifuentes","Estupiñán","Gruezo","Mena","Plata","Preciado","Valencia"],suffix:["a","ez","o"]},
"ve":{first:["Salomón","Yangel","Tomás","Darwin","Josef","Jhon","Jefferson","Rómulo","Wuilker","Nahuel"],prefix:["Aramburu","Cásseres","Ferraresi","Machís","Martínez","Osorio","Rondón","Savarino","Soteldo"],suffix:["a","ez","o"]},
"gy":{first:["Neil","Omari","Callum","Liam","Nathan","Emery","Keanu","Daniel","Jalen","Marcus"],prefix:["Bonds","Cox","Daniel","Dover","Harriott","Jones","Moore","Reifer","Roberts"],suffix:["er","ley","man","son"]},
"sr":{first:["Sheraldo","Tjaronn","Gleofilo","Ridgeciano","Diego","Damil","Shaquille","Myenty","Virgil","Ryan"],prefix:["Becker","Donk","Haps","Klaiber","Pinas","Te Vrede","Vlijter"],suffix:["berg","man","son","stra"]}
};

const COUNTRY_PROFILE_BY_NAME={"Deutschland":"de","Österreich":"at","Schweiz":"ch","Niederlande":"nl","Belgien":"be","Luxemburg":"lu","Dänemark":"dk","Schweden":"se","Norwegen":"no","Finnland":"fi","Island":"is","England":"en","Schottland":"sco","Wales":"wal","Irland":"irl","Nordirland":"nir","Frankreich":"fr","Spanien":"es","Portugal":"pt","Italien":"it","Andorra":"cat","Monaco":"fr","San Marino":"it","Malta":"mt","Rumänien":"ro","Moldau":"md","Polen":"pl","Tschechien":"cz","Slowakei":"sk","Ungarn":"hu","Slowenien":"si","Kroatien":"hr","Bosnien und Herzegowina":"ba","Serbien":"rs","Montenegro":"me","Nordmazedonien":"mk","Albanien":"al","Kosovo":"xk","Bulgarien":"bg","Griechenland":"gr","Ukraine":"ua","Belarus":"by","Russland":"ru","Litauen":"lt","Lettland":"lv","Estland":"ee","Georgien":"ge","Armenien":"am","Aserbaidschan":"az","Türkei":"tr","Zypern":"cy","Marokko":"ma","Algerien":"dz","Tunesien":"tn","Libyen":"ly","Ägypten":"eg","Sudan":"sd","Senegal":"sn","Mali":"ml","Guinea":"gn","Gambia":"gm","Mauretanien":"mr","Elfenbeinküste":"ci","Ghana":"gh","Togo":"tg","Benin":"bj","Burkina Faso":"bf","Nigeria":"ng","Kamerun":"cm","Gabun":"ga","Kongo":"cg","DR Kongo":"cd","Angola":"ao","Sambia":"zm","Simbabwe":"zw","Mosambik":"mz","Südafrika":"za","Namibia":"na","Botswana":"bw","Kenia":"ke","Uganda":"ug","Tansania":"tz","Ruanda":"rw","Äthiopien":"et","Eritrea":"er","Somalia":"so","Madagaskar":"mg","Kap Verde":"cv","Saudi-Arabien":"sa","VAE":"ae","Katar":"qa","Kuwait":"kw","Oman":"om","Bahrain":"bh","Jordanien":"jo","Libanon":"lb","Syrien":"sy","Irak":"iq","Iran":"ir","Israel":"il","Palästina":"ps","Kasachstan":"kz","Usbekistan":"uz","Kirgisistan":"kg","Tadschikistan":"tj","Turkmenistan":"tm","Afghanistan":"af","Pakistan":"pk","Indien":"in","Bangladesch":"bd","Sri Lanka":"lk","Nepal":"np","China":"cn","Japan":"jp","Südkorea":"kr","Nordkorea":"kp","Mongolei":"mn","Thailand":"th","Vietnam":"vn","Malaysia":"my","Singapur":"sg","Indonesien":"id","Philippinen":"ph","Myanmar":"mm","Kambodscha":"kh","Laos":"la","Australien":"au","Neuseeland":"nz","Fidschi":"fj","Samoa":"ws","Tonga":"to","Papua-Neuguinea":"pg","USA":"us","Kanada":"ca","Mexiko":"mx","Costa Rica":"cr","Panama":"pa","Honduras":"hn","Guatemala":"gt","El Salvador":"sv","Nicaragua":"ni","Jamaika":"jm","Trinidad und Tobago":"tt","Kuba":"cu","Haiti":"ht","Dominikanische Republik":"do","Brasilien":"br","Argentinien":"ar","Uruguay":"uy","Paraguay":"py","Chile":"cl","Peru":"pe","Bolivien":"bo","Kolumbien":"co","Ecuador":"ec","Venezuela":"ve","Guyana":"gy","Suriname":"sr"};


function normalizeGeneratedSurname(value){
 return String(value||"")
  .replace(/([a-zäöüćčšžņļķģīāēū])\1{2,}/gi,"$1$1")
  .replace(/\s+/g," ")
  .trim();
}
function countryNameProfile(country){
 const key=COUNTRY_PROFILE_BY_NAME[country?.name];
 return COUNTRY_NAME_PROFILES[key]||COUNTRY_NAME_PROFILES.en;
}
function proceduralSurname(country,rng=Math.random){
 const profile=countryNameProfile(country);
 const prefix=pick(profile.prefix,rng);
 const suffix=pick(profile.suffix,rng);
 let name=`${prefix}${suffix}`;
 if(rng()<.13){
   const second=`${pick(profile.prefix,rng)}${pick(profile.suffix,rng)}`;
   name+=rng()<.62?`-${second}`:` ${second}`;
 }
 return normalizeGeneratedSurname(name);
}
function countryFirstName(country,rng=Math.random){
 const profile=countryNameProfile(country);
 return pick(profile.first,rng);
}

export function generatePlayer({id,nationality=null,minAge=16,maxAge=34,minRating=48,maxRating=84,youth=false,rng=Math.random}={}){
 const country=nationality?COUNTRIES.find(c=>c.name===nationality)||pick(COUNTRIES,rng):pick(COUNTRIES,rng);
 const regionalNames=REGIONS[country.region]||REGIONS.germanic;
 const names=COUNTRY_NAME_POOLS[country.name]||regionalNames;
 let first=rng()<.22?pick(names.first,rng):countryFirstName(country,rng);
 let last=rng()<.18?pick(names.last,rng):proceduralSurname(country,rng);
 if(rng()<.18)first+=` ${pick(names.first,rng)}`;
 if(rng()<.08)last+=country.region==="romance"?` ${pick(["da","de","dos","del"],rng)} ${proceduralSurname(country,rng)}`:`-${proceduralSurname(country,rng)}`;
 const age=youth?Math.floor(15+rng()*4):Math.floor(minAge+rng()*(maxAge-minAge+1));
 const position=normalizePosition(weightedPosition(rng));
 let rating=Math.round(minRating+rng()*(maxRating-minRating));
 if(youth)rating=Math.round(45+rng()*22);
 const potential=Math.max(rating,Math.min(96,Math.round(rating+(youth?8+rng()*23:rng()*14))));
 return {
  id:id||Date.now()+Math.floor(rng()*1000000),teamId:null,name:`${first} ${last}`,nationality:country.name,flag:country.flag,
  age,position,rating,potential,value:marketValue(rating,age,potential),preferredFoot:rng()<.18?"Links":rng()<.025?"Beidfüßig":"Rechts",
  shirtNumber:0,contractUntil:"",form:Number((5.8+rng()*1.7).toFixed(1)),photo:"",injuredUntil:"",
  attributes:attributesFor(position,rating,rng),stats:{apps:0,goals:0,assists:0,yellow:0,red:0},
  history:[],status:"free",transferHistory:[],personality:pick(["Leader","Kämpfer","Teamspieler","Techniker","Arbeiter","Publikumsliebling","Ruhig","Ehrgeizig"],rng)
 };
}
export function generateCountrySpecificName(nationality,rng=Math.random){
 const country=COUNTRIES.find(c=>c.name===nationality);
 const regionalNames=REGIONS[country?.region]||REGIONS.germanic;
 const names=COUNTRY_NAME_POOLS[nationality]||regionalNames;
 let first=rng()<.22?pick(names.first,rng):countryFirstName(country,rng);
 let last=rng()<.18?pick(names.last,rng):proceduralSurname(country,rng);
 if(rng()<.16)first+=` ${pick(names.first,rng)}`;
 if(rng()<.08)last+=country?.region==="romance"?` ${pick(["da","de","dos","del"],rng)} ${proceduralSurname(country,rng)}`:`-${proceduralSurname(country,rng)}`;
 return `${first} ${last}`;
}

export function generatePlayers(count,options={}){
 const used=new Set(options.usedNames||[]),result=[];
 let guard=0;
 while(result.length<count&&guard<count*30){
  guard++;const p=generatePlayer(options);
  if(!used.has(p.name)){used.add(p.name);result.push(p)}
 }
 return result;
}
export function developPlayer(p,rng=Math.random){
 p.age=Number(p.age||18)+1;
 const gap=Math.max(0,Number(p.potential||p.rating)-Number(p.rating||60));
 let change=0;
 if(p.age<=21)change=Math.round(rng()*2+gap*.10);
 else if(p.age<=25)change=Math.round(rng()+gap*.065);
 else if(p.age<=29)change=rng()<.35?1:0;
 else if(p.age>=33)change=-(rng()<.7?1:0)-(p.age>=36&&rng()<.45?1:0);
 p.rating=Math.max(35,Math.min(Number(p.potential||99),Number(p.rating||60)+change));
 p.value=marketValue(p.rating,p.age,p.potential||p.rating);
 for(const key of Object.keys(p.attributes||{}))p.attributes[key]=Math.max(20,Math.min(99,Number(p.attributes[key]||p.rating)+Math.sign(change)*(rng()<.55?1:0)));
 return change;
}
export function playerCombinations(){
 return COUNTRIES.reduce((total,country)=>{
   const profile=countryNameProfile(country);
   const single=profile.prefix.length*profile.suffix.length;
   const double=single*single;
   return total+profile.first.length*(single+Math.floor(double*.13));
 },0);
}
