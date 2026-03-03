/**
 * Generátor textů pro webináře v Aibility Tone of Voice.
 * Struktura podle AI Edu Stream (září 2025 a novější).
 * Běží v prohlížeči – bez API.
 * Generuje: Veřejný popis, Confirmation mail, Co se naučíte (HTML)
 * 5 Superpowers v angličtině, lektor s medailonkem v Provede vás.
 */
(function(global) {
  'use strict';

  const CZ_TO_EN = [
    [/vidět příležitosti/i, 'Super Perception'],
    [/rozumná důvěra|kdy AI věřit|kdy ověřit/i, 'Super Intelligence'],
    [/umění promptů/i, 'Super Intelligence'],
    [/ukládání a znovupoužití znalostí/i, 'Super Knowledge'],
    [/rychlé tvoření|AI dělá 90|ty 10 %/i, 'Super Creation'],
    [/propojování nástrojů a systémů/i, 'Super Integration']
  ];
  function czToEnSuperpowers(arr) {
    if (!arr || !arr.length) return [];
    const seen = new Set();
    const out = [];
    for (const s of arr) {
      if (!s || String(s).startsWith('**')) continue;
      for (const [re, en] of CZ_TO_EN) {
        if (re.test(String(s))) {
          if (!seen.has(en)) { seen.add(en); out.push(en); }
          break;
        }
      }
    }
    return out;
  }

  const SUPER_DESC = {
    'Super Perception': 'Vidět, kde AI vytváří hodnotu – a zvědavost hledat to všude',
    'Super Intelligence': 'Lepší přemýšlení a chytřejší rozhodování díky symbióze s AI',
    'Super Knowledge': 'Učit se praxí a dělat vše znovupoužitelné. Nekonečná paměť',
    'Super Creation': 'Vytvářet a budovat rychle. AI dělá 90 %, ty dotáhneš těch 10 %',
    'Super Integration': 'Navrhovat systémy a postupy, kde AI a lidé spolupracují'
  };

  /** Medailonky lektorů – krátký popis profese pro vygenerovaný text. Zdroj: data/lektori.json */
  const LEKTORI = {
    'Jakub Danielka': 'Lektor a konzultant pro AI, automatizaci a expert na digitální transformaci',
    'Martin Imrich': 'Leader v Aibility. Pomáhá lidem a firmám získat superschopnosti díky AI. Více než 14 let v IT a B2B softwaru.',
    'Petra Kovandová': 'AI Coach & Ambassador. AI ambasadorka v Century21, inspiruje k využití AI v cestovním ruchu a realitním trhu.',
    'Lenka Stawarczyk': 'Marketérka a UX writerka. Učí marketéry využívat AI rychle a chytře.',
    'Žaneta Pavlíčková': 'Business Development. První kontakt mezi firmou a její AI budoucností.',
    'Josef Hajkr': 'CEO SHINE Consulting. Lídr propojující lidi, projekty a AI. Autor konceptu Řízení projektů 5.0.',
    'Tom Paulus': 'Designér, který zvyšuje konverze a zlepšuje zákaznickou zkušenost. Deset let v produktovém designu.',
    'Honza Hubka': 'Lektor AI nástrojů a vyhledávání.',
    'Jan Hubka': 'Lektor AI nástrojů a vyhledávání.',
    'Ondřej Hanigovský': 'Průvodce digitální džunglí a certifikovaný expert na automatizace.',
    'Petra Květová Pšeničná': 'Moderátorka a facilitátorka AI Edu Stream. Propojuje svět médií, nezisku a vzdělávání.',
    'Filip Dřímalka': 'Zakladatel Aibility. Odborník na digitální inovace. Autor knihy Budoucnost neprací.'
  };
  function getLektoriBio(lektor) {
    if (!lektor || !String(lektor).trim()) return [];
    let raw = String(lektor).trim();
    if (raw.toLowerCase().includes(' nebo ')) raw = raw.split(/ nebo /i)[0].trim();
    const parts = raw.split(/\s*\+\s*|,\s*(?![^(]*\))/);
    const out = [];
    for (const p of parts) {
      const m = p.trim().match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      const jmeno = m ? m[1].trim() : p.trim();
      const role = m ? m[2].trim() : '';
      const bio = LEKTORI[jmeno] || (role.toLowerCase().includes('moderátor') ? 'moderátorka AI Edu Stream' : role || 'lektor');
      out.push([jmeno, bio]);
    }
    return out;
  }

  const DEFAULT_CONTENT = {
    hook_pain: 'Cítíte, že AI nabízí víc, než aktuálně využíváte?',
    hook_promise: 'Ukážeme vám praktické postupy, které můžete začít používat hned druhý den.',
    sections: [
      { emoji: '🎯', title: 'Praktické ukázky', items: ['Konkrétní příklady z praxe firem', 'Živé demo s interakcí', 'Tipy a triky, které jinde nenajdete'] },
      { emoji: '🛠️', title: 'Hands-on část', items: ['Vlastní projekt pod vedením lektora', 'Individuální konzultace a odpovědi', 'Materiály a šablony k použití po workshopu'] }
    ],
    confirm_benefit: 'jak efektivněji pracovat s AI v praxi',
    confirm_detail: 'Ukážeme vám konkrétní postupy, které můžete začít používat hned.',
    co_se_naucite: ['Praktické postupy pro práci s AI', 'Konkrétní tipy a triky z praxe', 'Jak začít s AI hned druhý den', 'Jak pokračovat ve vzdělávání a rozvoji']
  };

  const LEVEL_MAP = {
    'Zacatecniky': 'Úroveň 1 – Manuální používání AI', 'Začátečníky': 'Úroveň 1 – Manuální používání AI',
    'Mirne pokrocile': 'Úroveň 2 – Vytváření AI asistentů', 'Mírně pokročilé': 'Úroveň 2 – Vytváření AI asistentů',
    'Stredne pokrocile': 'Úroveň 3 – AI-poháněné skriptování a vibe coding', 'Středně pokročilé': 'Úroveň 3 – AI-poháněné skriptování a vibe coding',
    'Pokrocile': 'Úroveň 4 – Automatizace procesů s AI', 'Pokročilé': 'Úroveň 4 – Automatizace procesů s AI',
    'Super pokrocile': 'Úroveň 5 – AI agenti a agentské pracovní postupy', 'Super pokročilé': 'Úroveň 5 – AI agenti a agentské pracovní postupy'
  };

  /** Generuje delší USP ve stylu „proč to bude skvělé“ – top kvalita, plné věty */
  function generateUsp(tema, modul, content, existingUsp) {
    if (existingUsp && existingUsp.trim().length >= 100 && existingUsp.includes('.')) return existingUsp.trim();
    const benefit = (content.hook_promise || content.confirm_benefit || 'využít AI v práci efektivněji').replace(/workflow/g, 'postup');
    const templates = [
      () => `Jedinečná příležitost ${['naučit se', 'zvládnout', 'osvojit si'][Math.floor(Math.random()*3)]} ${benefit.toLowerCase()} – konkrétní postupy, které můžete použít hned druhý den.`,
      () => `Jediná lekce, která vám ukáže, jak ${benefit.toLowerCase()}. Žádná teorie – jen to, co funguje v praxi.`,
      () => `Komplexní workshop, který z vás udělá ${benefit} za jediné odpoledne.`,
      () => `Aneb proč to bude skvělé: ${benefit.replace(/\.$/, '')}. Ukážeme si to na reálných příkladech a z webináře odejdete s jasným plánem.`,
      () => `Praktický webinář, kde ${benefit.toLowerCase().replace(/\.$/, '')}. Z webináře odejdete s konkrétními postupy, které můžete začít používat ihned.`,
      () => `${benefit} Ideální pro ty, kdo chtějí AI využít naplno a nechtějí zůstat pozadu.`
    ];
    let usp = templates[Math.floor(Math.random() * templates.length)]();
    if (usp && !/[.!?]$/.test(usp)) usp = usp.trim() + '.';
    return usp;
  }

  const PRO_LABEL = {
    'Zacatecniky': 'Začátečníky', 'Začátečníky': 'Začátečníky',
    'Mirne pokrocile': 'Mírně pokročilé', 'Mírně pokročilé': 'Mírně pokročilé',
    'Stredne pokrocile': 'Středně pokročilé', 'Středně pokročilé': 'Středně pokročilé',
    'Pokrocile': 'Pokročilé', 'Pokročilé': 'Pokročilé',
    'Super pokrocile': 'Super pokročilé', 'Super pokročilé': 'Super pokročilé'
  };

  function buildContentFromSP(opts) {
    const problem = opts.problem || 'Cítíte, že AI nabízí víc, než aktuálně využíváte?';
    const reseni = opts.reseni || 'Ukážeme vám praktické postupy, které můžete začít používat hned druhý den.';
    const supRaw = (opts.superschopnosti || []).filter(s => s && !String(s).startsWith('**'));
    const sup = czToEnSuperpowers(supRaw);
    let obs = opts.obsah || [];
    if (!Array.isArray(obs)) obs = [];
    obs = obs.filter(o => o && typeof o === 'string' && !o.trim().startsWith('**'));
    const co_si_odnesou = opts.co_si_odnesou || '';

    const sections = obs.length
      ? [{ emoji: '📚', title: 'Obsah webináře', items: obs }]
      : DEFAULT_CONTENT.sections;

    const confirm_benefit = co_si_odnesou
      ? (co_si_odnesou.split('.')[0] || '').substring(0, 120) || 'praktické postupy pro práci s AI'
      : 'praktické postupy pro práci s AI';
    const confirm_detail = co_si_odnesou || 'Ukážeme vám konkrétní postupy, které můžete začít používat hned.';
    const co_se_naucite = obs.length ? obs : DEFAULT_CONTENT.co_se_naucite;

    return {
      hook_pain: problem,
      hook_promise: reseni,
      sections,
      confirm_benefit,
      confirm_detail,
      co_se_naucite,
      sp_superschopnosti: sup
    };
  }

  /** Generuje veřejný popis – delší formát, lektor jen v Provede vás s medailonkem */
  function generateVerejnyPopis(tema, modul, content, lektor, usp, doporucujeme_pro, sp_superschopnosti) {
    const lines = [tema, ''];
    lines.push('💡 O čem tento webinář je');
    lines.push('');
    lines.push(content.hook_pain);
    lines.push('');
    lines.push(content.hook_promise);
    lines.push('');
    lines.push(modul === 'Chat'
      ? 'Tento webinář vás naučí přemýšlet o AI jinak – jako o kolegovi, kterého máte vždy po ruce. Ukážeme si konkrétní postupy, které můžete začít používat hned druhý den. Žádná teorie navíc – jen to, co funguje v praxi.'
      : 'Tento workshop vás provede od nápadu k funkčnímu výsledku. Ukážeme si konkrétní postupy, které můžete začít používat hned druhý den. Žádné programátorské zkušenosti nejsou potřeba – stačí chuť experimentovat.');
    lines.push('');
    lines.push('📚 Co se naučíte');
    lines.push('');
    for (const section of content.sections) {
      if (section.title && !['Obsah webináře', 'Co se naučíte'].includes(section.title)) {
        lines.push(section.emoji + ' ' + section.title);
        lines.push('');
      }
      for (const item of section.items) lines.push('• ' + item);
      lines.push('');
    }
    const sp = sp_superschopnosti || [];
    if (sp.length) {
      lines.push('⚡ Jaké superschopnosti získáte');
      lines.push('');
      lines.push('(podle metodiky Superpower Professional®)');
      lines.push('');
      for (const skill of sp) {
        const desc = SUPER_DESC[skill] || '';
        lines.push('• ' + skill + (desc ? ' – ' + desc : ''));
      }
    }
    lines.push('');
    lines.push('Tento webinář je součástí programu Superpowered Professional® od Aibility.');
    lines.push('');
    lines.push('🎯 Ideální pro');
    lines.push('');
    if (doporucujeme_pro) {
      const firstLevel = doporucujeme_pro.split(',')[0].trim();
      const levelName = LEVEL_MAP[firstLevel] || 'Úroveň 1 – Manuální používání AI';
      lines.push('• ' + (PRO_LABEL[firstLevel] || doporucujeme_pro));
      if (levelName.includes('1') || levelName.includes('Manuální')) {
        lines.push('• Manažery a podnikatele, kteří chtějí AI začít používat smysluplně');
        lines.push('• Zaměstnance a studenty bez předchozích zkušeností s AI');
        lines.push('• Každého, kdo nechce zůstat pozadu');
      } else if (levelName.includes('4') || levelName.includes('5') || levelName.includes('Pokročilé') || levelName.includes('agenti')) {
        lines.push('• Ty, kdo už AI aktivně používají a chtějí jít dál');
        lines.push('• Týmy připravující se na AI transformaci');
        lines.push('• Obsah přizpůsobený vaší roli a potřebám');
      } else {
        lines.push('• Mírně až středně pokročilé uživatele');
        lines.push('• Manažery a týmy, které chtějí efektivněji využívat AI nástroje');
        lines.push('• Každého, kdo chce z dat a procesů vytěžit maximum');
      }
    } else {
      lines.push('• Pro ty, kdo chtějí AI využít v práci i životě');
      lines.push('• Manažery, podnikatele, zaměstnance i studenty');
      lines.push('• Každého, kdo nechce zůstat pozadu');
    }
    lines.push('');
    lines.push('🧩 Požadavky');
    lines.push('');
    if (modul === 'Chat') {
      lines.push('• Přístup k AI asistentovi (ChatGPT, Claude, Copilot nebo jiný)');
      lines.push('• Chuť zkoušet nové věci');
    } else {
      lines.push('• Počítač s přístupem k internetu');
      lines.push('• Žádné programátorské zkušenosti nejsou potřeba');
      lines.push('• Chuť experimentovat a stavět');
    }
    const lektori = getLektoriBio(lektor);
    if (lektori.length) {
      lines.push('');
      lines.push('👥 Provede vás');
      lines.push('');
      for (const [jmeno, bio] of lektori) lines.push('• ' + jmeno + ' – ' + bio);
      if (!lektori.some(([, b]) => b.toLowerCase().includes('moderátor'))) {
        lines.push('• Petra Květová Pšeničná – moderátorka AI Edu Stream');
      }
    }
    lines.push('');
    lines.push('Tento webinář je součástí programu Superpowered Professional® od Aibility.');
    return lines.join('\n');
  }

  function generateConfirmationMail(tema, modul, content, lektor) {
    const typ = modul === 'Build' ? 'workshop' : 'webinář';
    const lektori = getLektoriBio(lektor);
    const lektorClause = lektori.length
      ? ', kde vás ' + lektori.map(([j]) => j).join(', ') + ' provedou praktickým postupem'
      : '';
    let benefit = content.confirm_benefit;
    if (benefit && !/^(jak|že|proč)/i.test(benefit.trim())) benefit = 'jak ' + benefit;
    return (
      'Právě jste si zajistili místo na ' + typ + 'u ' + tema + lektorClause + ', ' +
      'kde se dozvíte, ' + benefit + '. ' +
      content.confirm_detail + '\n\n' +
      'Tento ' + typ + ' je součástí programu Superpowered Professional® – ' +
      'metodiky, která vám pomůže získat superschopnosti pro práci s AI.\n\n' +
      'Připravte se na praktický ' + typ + ' plný tipů, které můžete začít ' +
      'používat hned druhý den. Žádná zbytečná teorie – jdeme rovnou k věci.\n\n' +
      'Těšíme se na vás!\n' +
      'Tým Aibility'
    );
  }

  function htmlEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function generateCoSeNauciteHtml(content) {
    const body = (content.co_se_naucite || DEFAULT_CONTENT.co_se_naucite).filter(Boolean);
    const items = body.map(b => '  <li style="margin: 0;">' + htmlEscape(b) + '</li>').join('\n');
    return '<ul style="margin: 0;">\n' + items + '\n</ul>';
  }

  /**
   * Vygeneruje všechny 3 texty pro webinář.
   * @param {Object} draft - Draft s tema, modul, zdrojova_zprava, metadata, jaky_problem_resi, co_by_bylo_obsahem, usp, doporucujeme_pro, doporuceny_lektor
   */
  function generateTexts(draft) {
    const tema = draft.tema || 'Webinář';
    const modul = draft.modul || 'Chat';
    const lektor = draft.doporuceny_lektor || draft.vybrany_lektor || '';
    const usp = draft.usp || '';
    const doporucujeme_pro = draft.doporucujeme_pro || '';

    let metadata = {};
    try {
      metadata = typeof draft.metadata === 'string' ? JSON.parse(draft.metadata || '{}') : (draft.metadata || {});
    } catch (e) {}

    let obsah = [];
    try {
      const raw = draft.co_by_bylo_obsahem;
      obsah = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : []);
    } catch (e) {}
    obsah = obsah.filter(o => o && typeof o === 'string' && !o.trim().startsWith('**'));

    const problem = draft.jaky_problem_resi || '';
    const reseni = metadata.reseni || '';
    const co_si_odnesou = metadata.co_si_odnesou || '';
    const supList = (usp || '').split(',').map(s => s.trim()).filter(Boolean);

    const useSP = !!(problem || reseni || co_si_odnesou || obsah.length);
    const content = useSP
      ? buildContentFromSP({
          problem,
          reseni,
          obsah,
          co_si_odnesou,
          superschopnosti: supList
        })
      : DEFAULT_CONTENT;

    // Vygeneruj delší USP ve stylu „proč to bude skvělé“, pokud je stávající krátký
    const generatedUsp = generateUsp(tema, modul, content, usp);
    const uspToUse = generatedUsp;

    const verejny_popis = generateVerejnyPopis(
      tema, modul, content, lektor, uspToUse, doporucujeme_pro,
      content.sp_superschopnosti
    );
    const confirmation_mail = generateConfirmationMail(tema, modul, content, lektor);
    const co_se_naucite_html = generateCoSeNauciteHtml(content);

    return {
      verejny_popis,
      confirmation_mail,
      co_se_naucite_html,
      usp: uspToUse
    };
  }

  global.TextGenerator = { generateTexts };
})(typeof window !== 'undefined' ? window : globalThis);
