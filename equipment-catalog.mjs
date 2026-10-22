// Original ZIP inventory; ready means the current runtime model/animation/audio path is integrated.
export const EQUIPMENT=Object.freeze([
  {
    "id": "classic",
    "label": "CLASSIC",
    "category": "sidearm",
    "slot": "sidearm",
    "ready": true,
    "source": "Weapons/Classic.blend"
  },
  {
    "id": "shorty",
    "label": "SHORTY",
    "category": "sidearm",
    "slot": "sidearm",
    "ready": true,
    "source": "Weapons/Shorty.blend"
  },
  {
    "id": "frenzy",
    "label": "FRENZY",
    "category": "sidearm",
    "slot": "sidearm",
    "ready": true,
    "source": "Weapons/Frenzy.blend"
  },
  {
    "id": "ghost",
    "label": "GHOST",
    "category": "sidearm",
    "slot": "sidearm",
    "ready": true,
    "source": "Weapons/Ghost.blend"
  },
  {
    "id": "sheriff",
    "label": "SHERIFF",
    "category": "sidearm",
    "slot": "sidearm",
    "ready": true,
    "source": "Weapons/Sheriff.blend"
  },
  {
    "id": "stinger",
    "label": "STINGER",
    "category": "smg",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Stinger.blend"
  },
  {
    "id": "spectre",
    "label": "SPECTRE",
    "category": "smg",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Spectre.blend"
  },
  {
    "id": "bucky",
    "label": "BUCKY",
    "category": "shotgun",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Bucky.blend"
  },
  {
    "id": "judge",
    "label": "JUDGE",
    "category": "shotgun",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Judge.blend"
  },
  {
    "id": "bulldog",
    "label": "BULLDOG",
    "category": "rifle",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Bulldog.blend"
  },
  {
    "id": "guardian",
    "label": "GUARDIAN",
    "category": "rifle",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Guardian.blend"
  },
  {
    "id": "phantom",
    "label": "PHANTOM",
    "category": "rifle",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Phantom.blend"
  },
  {
    "id": "vandal",
    "label": "VANDAL",
    "category": "rifle",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Vandal.blend"
  },
  {
    "id": "marshal",
    "label": "MARSHAL",
    "category": "sniper",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Marshal.blend"
  },
  {
    "id": "operator",
    "label": "OPERATOR",
    "category": "sniper",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Operator.blend"
  },
  {
    "id": "ares",
    "label": "ARES",
    "category": "machine",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Aries.blend"
  },
  {
    "id": "odin",
    "label": "ODIN",
    "category": "machine",
    "slot": "primary",
    "ready": true,
    "source": "Weapons/Odin.blend"
  },
  {
    "id": "knife",
    "label": "KNIFE",
    "category": "melee",
    "slot": "melee",
    "ready": true,
    "source": "Weapons/Knife.blend"
  }
].map(Object.freeze));
export const VARIANTS=Object.freeze([
  {
    "id": "infantryares",
    "label": "Infantry Ares",
    "weapon": "ares",
    "source": "Weapons/infantryAres.blend",
    "ready": false
  },
  {
    "id": "infantryguardian",
    "label": "Infantry Guardian",
    "weapon": "guardian",
    "source": "Weapons/infantryGuardian.blend",
    "ready": false
  },
  {
    "id": "infantryspectre",
    "label": "Infantry Spectre",
    "weapon": "spectre",
    "source": "Weapons/infantrySpectre.blend",
    "ready": false
  },
  {
    "id": "infantryghost",
    "label": "Infantry Ghost",
    "weapon": "ghost",
    "source": "Weapons/infantryGhost.blend",
    "ready": false
  },
  {
    "id": "infantryoperator",
    "label": "Infantry Operator",
    "weapon": "operator",
    "source": "Weapons/infantryOperator.blend",
    "ready": false
  },
  {
    "id": "aristocratvandal",
    "label": "Aristocrat Vandal",
    "weapon": "vandal",
    "source": "Weapons/aristocratVandal.blend",
    "ready": false
  },
  {
    "id": "aristocratstinger",
    "label": "Aristocrat Stinger",
    "weapon": "stinger",
    "source": "Weapons/aristocratStinger.blend",
    "ready": false
  },
  {
    "id": "aerosolshorty",
    "label": "Aerosol Shorty",
    "weapon": "shorty",
    "source": "Weapons/aerosolShorty.blend",
    "ready": false
  },
  {
    "id": "aerosolodin",
    "label": "Aerosol Odin",
    "weapon": "odin",
    "source": "Weapons/aerosolOdin.blend",
    "ready": false
  },
  {
    "id": "aerosolbucky",
    "label": "Aerosol Bucky",
    "weapon": "bucky",
    "source": "Weapons/aerosolBucky.blend",
    "ready": false
  },
  {
    "id": "aerosoloperator",
    "label": "Aerosol Operator",
    "weapon": "operator",
    "source": "Weapons/aerosolOperator.blend",
    "ready": false
  },
  {
    "id": "luxeknife",
    "label": "Luxe Knife",
    "weapon": "knife",
    "source": "Weapons/luxeKnife.blend",
    "ready": false
  },
  {
    "id": "reaverknife",
    "label": "Reaver Knife",
    "weapon": "knife",
    "source": "Weapons/reaverKnife.blend",
    "ready": false
  },
  {
    "id": "primeaxe",
    "label": "Prime Axe",
    "weapon": "knife",
    "source": "Weapons/primeAxe.blend",
    "ready": false
  }
].map(Object.freeze));
export const AGENTS=Object.freeze([
  {
    "id": "jett",
    "label": "Jett",
    "role": "Duelist",
    "ready": true,
    "source": "Agents/Jett/jettSimple.blend",
    "firstPersonSource": "Agents/Jett/jettFirstPerson.blend",
    "complexSource": "Agents/Jett/jettComplex.blend"
  },
  {
    "id": "phoenix",
    "label": "Phoenix",
    "role": "Duelist",
    "ready": false,
    "source": "Agents/Phoenix/phoenixSimple.blend",
    "firstPersonSource": "Agents/Phoenix/phoenixFirstPerson.blend",
    "complexSource": "Agents/Phoenix/phoenixComplex.blend"
  },
  {
    "id": "reyna",
    "label": "Reyna",
    "role": "Duelist",
    "ready": false,
    "source": "Agents/Reyna/reynaSimple.blend",
    "firstPersonSource": "Agents/Reyna/reynaFirstPerson.blend",
    "complexSource": "Agents/Reyna/reynaComplex.blend"
  },
  {
    "id": "raze",
    "label": "Raze",
    "role": "Duelist",
    "ready": false,
    "source": "Agents/Raze/razeSimple.blend",
    "firstPersonSource": "Agents/Raze/razeFirstPerson.blend",
    "complexSource": "Agents/Raze/razeComplex.blend"
  },
  {
    "id": "yoru",
    "label": "Yoru",
    "role": "Duelist",
    "ready": false,
    "source": "Agents/Yoru/yoruSimple.blend",
    "firstPersonSource": "Agents/Yoru/yoruFirstPerson.blend",
    "complexSource": "Agents/Yoru/yoruComplex.blend"
  },
  {
    "id": "neon",
    "label": "Neon",
    "role": "Duelist",
    "ready": false,
    "source": "Agents/Neon/neonSimple.blend",
    "firstPersonSource": "Agents/Neon/neonFirstPerson.blend",
    "complexSource": "Agents/Neon/neonComplex.blend"
  },
  {
    "id": "sova",
    "label": "Sova",
    "role": "Initiator",
    "ready": false,
    "source": "Agents/Sova/sovaSimple.blend",
    "firstPersonSource": "Agents/Sova/sovaFirstPerson.blend",
    "complexSource": "Agents/Sova/sovaComplex.blend"
  },
  {
    "id": "breach",
    "label": "Breach",
    "role": "Initiator",
    "ready": false,
    "source": "Agents/Breach/breachSimple.blend",
    "firstPersonSource": "Agents/Breach/breachFirstPerson.blend",
    "complexSource": "Agents/Breach/breachComplex.blend"
  },
  {
    "id": "skye",
    "label": "Skye",
    "role": "Initiator",
    "ready": false,
    "source": "Agents/Skye/skyeSimple.blend",
    "firstPersonSource": "Agents/Skye/skyeFirstPerson.blend",
    "complexSource": "Agents/Skye/skyeComplex.blend"
  },
  {
    "id": "kayo",
    "label": "KAY/O",
    "role": "Initiator",
    "ready": false,
    "source": "Agents/KayO/kayoSimple.blend",
    "firstPersonSource": "Agents/KayO/kayoFirstPerson.blend",
    "complexSource": "Agents/KayO/kayoComplex.blend"
  },
  {
    "id": "fade",
    "label": "Fade",
    "role": "Initiator",
    "ready": false,
    "source": "Agents/Fade/fadeSimple.blend",
    "firstPersonSource": "Agents/Fade/fadeFirstPerson.blend",
    "complexSource": "Agents/Fade/fadeComplex.blend"
  },
  {
    "id": "gekko",
    "label": "Gekko",
    "role": "Initiator",
    "ready": false,
    "source": "Agents/Gekko/gekkoSimple.blend",
    "firstPersonSource": "Agents/Gekko/gekkoFirstPerson.blend",
    "complexSource": "Agents/Gekko/gekkoComplex.blend"
  },
  {
    "id": "brimstone",
    "label": "Brimstone",
    "role": "Controller",
    "ready": false,
    "source": "Agents/Brimstone/brimstoneSimple.blend",
    "firstPersonSource": "Agents/Brimstone/brimstoneFirstPerson.blend",
    "complexSource": "Agents/Brimstone/brimstoneComplex.blend"
  },
  {
    "id": "viper",
    "label": "Viper",
    "role": "Controller",
    "ready": false,
    "source": "Agents/Viper/viperSimpleNoMask.blend",
    "firstPersonSource": "Agents/Viper/viperFirstPerson.blend",
    "complexSource": "Agents/Viper/viperComplex.blend"
  },
  {
    "id": "omen",
    "label": "Omen",
    "role": "Controller",
    "ready": false,
    "source": "Agents/Omen/omenSimple.blend",
    "firstPersonSource": "Agents/Omen/omenFirstPerson.blend",
    "complexSource": "Agents/Omen/omenComplex.blend"
  },
  {
    "id": "astra",
    "label": "Astra",
    "role": "Controller",
    "ready": false,
    "source": "Agents/Astra/astraSimple.blend",
    "firstPersonSource": "Agents/Astra/astraFirstPerson.blend",
    "complexSource": "Agents/Astra/astraComplex.blend"
  },
  {
    "id": "harbor",
    "label": "Harbor",
    "role": "Controller",
    "ready": false,
    "source": "Agents/Harbor/harborSimple.blend",
    "firstPersonSource": "Agents/Harbor/harborFirstPerson.blend",
    "complexSource": "Agents/Harbor/harborComplex.blend"
  },
  {
    "id": "sage",
    "label": "Sage",
    "role": "Sentinel",
    "ready": false,
    "source": "Agents/Sage/sageSimple.blend",
    "firstPersonSource": "Agents/Sage/sageFirstPerson.blend",
    "complexSource": "Agents/Sage/sageComplex.blend"
  },
  {
    "id": "cypher",
    "label": "Cypher",
    "role": "Sentinel",
    "ready": false,
    "source": "Agents/Cypher/cypherSimple.blend",
    "firstPersonSource": "Agents/Cypher/cypherFirstPerson.blend",
    "complexSource": "Agents/Cypher/cypherComplex.blend"
  },
  {
    "id": "killjoy",
    "label": "Killjoy",
    "role": "Sentinel",
    "ready": false,
    "source": "Agents/Killjoy/killjoySimple.blend",
    "firstPersonSource": "Agents/Killjoy/killjoyFirstPerson.blend",
    "complexSource": "Agents/Killjoy/killjoyComplex.blend"
  },
  {
    "id": "chamber",
    "label": "Chamber",
    "role": "Sentinel",
    "ready": false,
    "source": "Agents/Chamber/chamberSimple.blend",
    "firstPersonSource": "Agents/Chamber/chamberFirstPerson.blend",
    "complexSource": "Agents/Chamber/chamberComplex.blend"
  }
].map(Object.freeze));
