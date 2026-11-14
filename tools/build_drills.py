# -*- coding: utf-8 -*-
"""Генерирует drills.json — банк упражнений по правилам учебника.
Запуск: python3 -I tools/build_drills.py drills.json
Новые упражнения добавляй в списки ниже (id не менять!) и пересобирай.
Типы: choice (выбери вариант), build (собери предложение из слов), type (напиши сам).
mine=True — упражнение построено на реальной ошибке Сергея.
"""
import json, sys, re

D = []
_n = {}

def add(ch, typ, **kw):
    _n[ch] = _n.get(ch, 0) + 1
    d = {"id": "d%02d-%02d" % (ch, _n[ch]), "ch": ch, "type": typ}
    d.update(kw)
    D.append(d)

def C(ch, q, options, answer, why, mine=False, prompt=None):
    add(ch, "choice", q=q, options=options, answer=answer, why=why, mine=mine, **({"prompt": prompt} if prompt else {}))

def B(ch, ru, answer, extra, why, mine=False):
    add(ch, "build", ru=ru, answer=answer, extra=extra, why=why, mine=mine)

def T(ch, ru, answer, alts, why, mine=False, prompt=None):
    add(ch, "type", ru=ru, answer=answer, alts=alts, why=why, mine=mine, **({"prompt": prompt} if prompt else {}))

# ---------------- 1. Предложение и глагол ----------------
C(1, "My program ___ beautiful.", ["is", "are", "am", "be"], "is",
  "Один предмет (program): is. Глагол «быть» в английском обязателен, даже когда по-русски его нет.")
C(1, "I ___ a seller.", ["am", "is", "are", "be"], "am", "С I всегда am (в речи I'm).")
C(1, "Sellers ___ busy.", ["are", "is", "am", "be"], "are", "Много предметов или людей (sellers): are.")
C(1, "Выбери верное предложение.",
  ["The software is beautiful.", "The software beautiful.", "The software be beautiful.", "The software are beautiful."],
  "The software is beautiful.", "Без глагола предложения нет: нужен is.", prompt="Какое предложение верное?")
T(1, "Я готовлю и ем.", "I cook and eat", ["I cook and eat."],
  "Два глагола подряд соединяем словом and: I cook and eat. Ошибка из занятия: «I cook eat».", mine=True,
  prompt="Исправь ошибку в «I cook eat»")
B(1, "Я проверяю продажи.", "I check sales", ["checks", "am"], "Порядок: кто → что делает → что. Глагол один.")
C(1, "My software ___ all sales. (показывает)", ["shows", "makes", "does", "is"], "shows",
  "«Показывает» = shows. Делать (make) здесь не подходит по смыслу. Ошибка из занятия: «My software make it all».", mine=True)
C(1, "Какое предложение верное?",
  ["I'm working on software right now.", "I make now is software.", "I working now software.", "I am work now is software."],
  "I'm working on software right now.", "Один глагол в нужной форме: am + working. Лишнее is убираем.", mine=True)

# ---------------- 2. Present Simple ----------------
C(2, "She ___ the app every day.", ["uses", "use", "using", "is use"], "uses", "she + привычка: к глаголу добавляем -s.")
C(2, "My software ___ sellers.", ["helps", "help", "helping", "to help"], "helps", "software = один предмет (it): help → helps.")
C(2, "I ___ sales every morning.", ["check", "checks", "am check", "checking"], "check", "С I глагол без изменений. every morning = привычка.")
C(2, "He ___ small bugs.", ["fixes", "fix", "fixs", "fixies"], "fixes", "Глагол на -x: добавляем -es.")
C(2, "She ___ English.", ["studies", "studys", "studyes", "study"], "studies", "Согласная + y: y меняем на ies.")
C(2, "My program ___ a lot of data.", ["has", "have", "haves", "is have"], "has", "have → has для he / she / it.")
T(2, "Я пользуюсь этим каждый день.", "I use it every day",
  ["I use this every day", "I use it daily", "I use this daily", "I use it every day."],
  "Привычка (every day): Present Simple, без -ing и без I'm.")
B(2, "Моя программа помогает продавцам.", "My software helps sellers", ["help", "is"],
  "software = it → helps; продавцов много → sellers.", mine=True)
C(2, "Какое предложение верное?", ["My software helps sellers.", "My software help sellers.", "My software helps seller.", "My software is help sellers."],
  "My software helps sellers.", "helps (с -s) и sellers (много продавцов).", mine=True)
C(2, "Do you ___ the app every day?", ["use", "uses", "using", "used"], "use", "После do глагол без -s.")

# ---------------- 3. Present Continuous ----------------
C(3, "Right now I ___ on the dictionary.", ["am working", "work", "working", "works"], "am working",
  "right now = прямо сейчас: am + working.")
C(3, "She ___ breakfast right now.", ["is cooking", "cooks", "cooking", "cook"], "is cooking", "she → is; прямо сейчас → -ing.")
C(3, "Какое предложение верное?", ["I use it every day.", "I'm use it every day.", "I using it every day.", "I'm using it every day."],
  "I use it every day.", "every day = привычка. I'm + простой глагол всегда ошибка. Ошибка из занятия: «I'm use this every day».", mine=True)
C(3, "Какое предложение верное?", ["I'm working today.", "I working today.", "I am work today.", "I'm work today."],
  "I'm working today.", "Перед -ing нужен am / I'm. Ошибка из занятия: «I working today».", mine=True)
C(3, "make → ___ (добавь -ing)", ["making", "makeing", "makking", "maks"], "making", "Немое e на конце убираем: make → making.")
C(3, "run → ___", ["running", "runing", "runeing", "runs"], "running", "Короткое слово с одной гласной и согласной: согласную удваиваем.")
C(3, "I ___ this app. (нравится)", ["like", "am liking", "'m like", "likeing"], "like",
  "like, want, need, know обычно без -ing.")
B(3, "Сейчас я работаю над словарём.", "Right now I'm working on a dictionary", ["work", "am"],
  "I'm + working; над = on; словарь один → a dictionary.")
T(3, "Я сейчас делаю словарь.", "I'm making a dictionary now",
  ["I am making a dictionary now", "I'm making a dictionary right now", "I am making a dictionary right now",
   "Now I'm making a dictionary", "Right now I'm making a dictionary", "Now I am making a dictionary", "Right now I am making a dictionary",
   "I'm making an English dictionary", "I am making an English dictionary"],
  "Прямо сейчас: am + making; словарь один: a dictionary.")

# ---------------- 4. Past Simple ----------------
C(4, "Yesterday I ___ on the app.", ["worked", "work", "am work", "was work"], "worked", "yesterday = прошлое: work + ed.")
C(4, "Yesterday my day ___ normal.", ["was", "is", "were", "be"], "was", "Прошлое от «быть»: was (I, he, she, it) / were (we, you, they).")
C(4, "Today I ___ small bugs. (уже сделано)", ["fixed", "fix", "fixing", "fixs"], "fixed", "Действие закончилось: fix + ed.")
C(4, "The sellers ___ busy yesterday.", ["were", "was", "are", "is"], "were", "Много людей, прошлое: were.")
C(4, "I ___ it last week. (use)", ["used", "useed", "uses", "using"], "used", "Глагол на -e: добавляем только -d.")
C(4, "Какое предложение верное?", ["My day was normal.", "My day is normal yesterday.", "My day were normal.", "My day was normally."],
  "My day was normal.", "День уже прошёл → was. Ошибка из занятия: «My day is normal».", mine=True)
T(4, "Сегодня я исправил небольшие баги.", "Today I fixed small bugs",
  ["I fixed small bugs today", "Today I fixed small mistakes and bugs", "Today I fixed small bugs and mistakes", "I fixed small mistakes and bugs today",
   "Today I fixed some small bugs", "I fixed some small bugs today", "Today I fixed the small bugs", "I fixed the small bugs today"],
  "fixed (прошлое), I с большой буквы, лишних is нет. Ошибка из занятия: «Today i fix is small mistakes and bags».", mine=True)
C(4, "Ошибка в программе по-английски: ___", ["bug", "bag", "back", "big"], "bug",
  "bug = ошибка в программе, bag = сумка. Ловушка на слух (глава 11).", mine=True)

# ---------------- 5. Будущее: will ----------------
C(5, "Today I ___ work as a taxi driver.", ["will", "wills", "am will", "will to"], "will", "will + глагол без изменений: I will work.")
C(5, "Tomorrow I ___ the dictionary.", ["will finish", "will finishes", "finish will", "am will finish"], "will finish",
  "tomorrow = будущее: will + глагол без -s.")
C(5, "He will ___ it tomorrow.", ["fix", "fixes", "fixed", "fixing"], "fix", "После will никогда нет -s, -ed, -ing.")
C(5, "I will = ?", ["I'll", "I'l", "Ill'", "I'am"], "I'll", "Сокращение: I will → I'll.")
B(5, "Завтра я буду работать.", "Tomorrow I will work", ["works", "am"], "tomorrow → will + work.")
T(5, "Я проверю продажи завтра.", "I will check sales tomorrow",
  ["I'll check sales tomorrow", "Tomorrow I will check sales", "Tomorrow I'll check sales", "I will check the sales tomorrow",
   "I'll check the sales tomorrow", "Tomorrow I will check the sales", "Tomorrow I'll check the sales"],
  "will + check, без -s.")

# ---------------- 6. Вопросы ----------------
C(6, "___ you use the app every day?", ["Do", "Does", "Are", "Is"], "Do", "I / you / we / they: Do.")
C(6, "___ she work at 1 p.m.?", ["Does", "Do", "Is", "Did"], "Does", "he / she / it: Does.")
C(6, "Does it ___ profit?", ["show", "shows", "showing", "showed"], "show",
  "-s «переехало» в does, глагол без -s. Ошибка-ловушка из учебника.", mine=False)
C(6, "___ you fix the bug yesterday?", ["Did", "Do", "Does", "Are"], "Did", "Прошлое: Did + глагол без -ed.")
C(6, "Did you ___ it?", ["fix", "fixed", "fixes", "fixing"], "fix", "После did глагол в обычной форме.")
C(6, "___ the program beautiful?", ["Is", "Does", "Do", "Are"], "Is", "С глаголом «быть» меняем порядок: Is + предмет + ...?")
B(6, "Ты пользуешься этим каждый день?", "Do you use it every day", ["uses", "does"], "Do + you + глагол без -s.")
B(6, "Что ты делаешь утром?", "What do you do in the morning", ["does", "doing"], "Вопросительное слово + do + кто + глагол.")
T(6, "Почему ты работаешь?", "Why do you work", ["Why do you work today", "Why do you work?"],
  "Why + do + you + глагол.")

# ---------------- 7. Отрицание ----------------
C(7, "I ___ know.", ["don't", "doesn't", "am not", "not"], "don't", "I don't know = я не знаю. Ошибка из занятия: «I don't now» (now = сейчас, know = знать).", mine=True)
C(7, "She ___ use the app.", ["doesn't", "don't", "isn't", "not"], "doesn't", "he / she / it: doesn't + глагол без -s.")
C(7, "I ___ fix the bug yesterday.", ["didn't", "don't", "doesn't", "wasn't"], "didn't", "Прошлое: didn't + глагол без -ed.")
C(7, "The software ___ beautiful.", ["isn't", "doesn't", "don't", "not"], "isn't", "С глаголом «быть»: is + not = isn't.")
C(7, "I ___ work tomorrow.", ["won't", "don't", "didn't", "am not"], "won't", "Будущее отрицание: will not = won't.")
T(7, "Я не знаю.", "I don't know", ["I do not know", "I don't know."], "don't + know.", mine=True)

# ---------------- 8. Артикли ----------------
C(8, "I'm making ___ dictionary.", ["a", "an", "the", "—"], "a",
  "Один из многих словарей: a. Ошибка из занятия: «dictionary of English» без артикля.", mine=True)
C(8, "It is ___ app.", ["an", "a", "the", "—"], "an", "app начинается с гласного звука: an.")
C(8, "I found a bug. ___ bug is small.", ["The", "A", "An", "—"], "The", "Баг уже упоминали, он известен обоим: the.")
C(8, "I need ___ money.", ["—", "a", "an", "the"], "—",
  "money неисчисляемое слово: артикль не нужен. Ошибка из занятия: «I need a money».", mine=True)
C(8, "I check all ___ statistics.", ["the", "a", "an", "—"], "the",
  "Речь о конкретных данных: the. Ошибка из занятия: «I check all statistics sheets».", mine=True)
C(8, "I like ___ statistics. (вообще)", ["—", "the", "a", "an"], "—", "Говорим вообще: артикль не нужен.")
C(8, "He is ___ seller.", ["a", "an", "the", "—"], "a", "seller начинается с согласного звука: a.")
C(8, "She works as ___ taxi driver.", ["a", "an", "the", "—"], "a", "Профессия: as + a + слово. taxi: согласный звук, значит a.", mine=True)

# ---------------- 9. Сравнение ----------------
C(9, "The app is ___ than before. (cool)", ["cooler", "more cool", "coolest", "most cool"], "cooler",
  "Короткое слово: добавляем -er. Ошибка из занятия: «more cool».", mine=True)
C(9, "This chart is ___ than that one. (big)", ["bigger", "more big", "biggest", "bigger than"], "bigger", "big → bigger (согласную удваиваем).")
C(9, "This program is ___ than that one. (beautiful)", ["more beautiful", "beautifuler", "most beautiful", "beautifuller"],
  "more beautiful", "Длинное слово: more + слово.")
C(9, "good → ___", ["better", "gooder", "more good", "best"], "better", "Особая форма: good → better.")
C(9, "I like making software ___.", ["better", "good", "more good", "best"], "better", "Сделать лучше = better.")

# ---------------- 10. Полезные конструкции ----------------
C(10, "I like ___ software.", ["making", "make", "to making", "makes"], "making", "like + глагол-ing.")
C(10, "I want ___ add a new chart.", ["to", "—", "for", "-ing"], "to", "want + to + глагол.")
C(10, "I like it ___ it is convenient.", ["because", "because of", "why", "so"], "because", "because + целое предложение: потому что.")
C(10, "___ sales go down, I check all the statistics.", ["When", "Then", "What", "While of"], "When", "When = когда.")
C(10, "I check sales, stock, logistics, ___ ad spend.", ["and", "or if", "but also", "with"], "and", "Перед последним пунктом перечисления ставим and.")
C(10, "Ты сказал «Nice to meet you». Как ответить?", ["Nice to meet you too.", "See you too.", "Goodbye too.", "Thank you too."],
  "Nice to meet you too.", "See you = «до встречи» (прощание). При знакомстве: Nice to meet you. Ошибка из занятия: «See you too».", mine=True,
  prompt="Как ответить на «Nice to meet you»?")
T(10, "Мне это нравится, потому что это удобно.", "I like it because it is convenient",
  ["I like it because it's convenient", "I like it because it is convenient.", "I like this because it is convenient", "I like this because it's convenient"],
  "like + it + because + целое предложение.")
B(10, "Я хочу добавить новый график.", "I want to add a new chart", ["adding", "the"], "want + to + глагол без -ing.")
T(10, "Я готовлю сэндвичи на завтрак.", "I make sandwiches for breakfast",
  ["I cook sandwiches for breakfast", "For breakfast I make sandwiches", "For breakfast I cook sandwiches", "I make sandwiches for breakfast."],
  "На завтрак = for breakfast (не on). Ошибка из занятия: «I cook on breakfast».", mine=True)

# ---------------- 11. Предлоги и слова-ловушки ----------------
C(11, "Today I will work ___ a taxi driver.", ["as", "in", "on", "at"], "as",
  "as = в роли, кем-то. in a taxi = внутри такси как пассажир. Ошибка из занятия: «work in taxi».", mine=True)
C(11, "I cook sandwiches ___ breakfast.", ["for", "on", "in", "at"], "for", "На завтрак / обед / ужин: for breakfast / lunch / dinner.", mine=True)
C(11, "Maybe at ___.", ["1 p.m.", "13 o'clock", "one hour", "on 13"], "1 p.m.",
  "o'clock говорим с 1–12. Для 13:00 естественнее 1 p.m. или 13:00.", mine=True, prompt="Как сказать «в час дня»?")
C(11, "I like the ___. (приложение на телефоне)", ["app", "software", "soft", "program of phone"], "app",
  "app = приложение на телефоне. software = программа вообще (Imabu software).")
C(11, "Imabu ___ shows sales.", ["software", "app", "softwares", "a software"], "software",
  "software неисчисляемое: без a и без -s.")
C(11, "Как пишется «программа» (software)?", ["software", "softweare", "sowtware", "softwere"], "software", "soft + ware. Ошибка из занятия: «softweare».", mine=True)
C(11, "Как пишется «красивый»?", ["beautiful", "beautifull", "beutiful", "beatiful"], "beautiful", "В конце одна l: beautiful. Ошибка из занятия: «beautifull».", mine=True)
C(11, "Как пишется «сегодня»?", ["today", "tooday", "todai", "to day"], "today", "Одно o в середине. Ошибка из занятия: «tooday».", mine=True)
C(11, "I don't ___ the answer. (я не знаю)", ["know", "now", "no", "knew"], "know",
  "know = знать (k не читается). now = сейчас. Ловушка на слух. Ошибка из занятия: «I don't now».", mine=True)
C(11, "I'm making ___. (английский словарь)", ["an English dictionary", "dictionary of English", "dictionary English", "a English dictionary"],
  "an English dictionary", "Определение ставим перед словом: English dictionary. English начинается с гласного звука: an.", mine=True,
  prompt="Как сказать «английский словарь»?")

out = sys.argv[1] if len(sys.argv) > 1 else "drills.json"
chapters = {
    1: "Предложение и глагол", 2: "Present Simple", 3: "Present Continuous", 4: "Past Simple", 5: "Будущее: will",
    6: "Вопросы", 7: "Отрицание", 8: "Артикли", 9: "Сравнение", 10: "Полезные конструкции", 11: "Предлоги и слова-ловушки",
}
ids = set()
for d in D:
    assert d["id"] not in ids, d["id"]
    ids.add(d["id"])
    if d["type"] == "choice":
        assert d["answer"] in d["options"], (d["id"], d["answer"])
        assert len(set(d["options"])) == len(d["options"]), (d["id"], "dup options")
        assert 2 <= len(d["options"]) <= 4
    if d["type"] == "build":
        assert len(d["answer"].split()) >= 3, d["id"]
json.dump({"version": 1, "updated": "2026-11-14", "chapters": {str(k): v for k, v in chapters.items()}, "drills": D},
          open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
from collections import Counter
print(len(D), "упражнений", dict(Counter(d["ch"] for d in D)), dict(Counter(d["type"] for d in D)))
