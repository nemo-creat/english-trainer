# -*- coding: utf-8 -*-
"""Содержание учебника. Дополняется после занятий; номера глав не меняются.

Разметка внутри строк:  [[английский]] — синий жирный,  {{ошибка}} — красный зачёркнутый.
Блоки: ("p", текст) | ("rule", текст) | ("tip", текст) | ("bullets", [..]) |
       ("ex", [(en, ru), ..]) | ("warn", [(неверно, верно, пояснение), ..]) |
       ("table", заголовки, строки, доли_ширины)
status: "done" — уже практиковали, "intro" — знакомство, ещё не отрабатывали.
"""

VERSION = "Версия 1 · 14 ноября 2026"

PREFACE = [
    ("p", "Это учебник, который мы пишем вместе по ходу занятий. После каждого урока в него добавляются новые правила, слова и разбор твоих ошибок. Номера глав не меняются: если я пишу «правило 2», ищи главу 2."),
    ("table", ["Значок", "Что значит"], [
        ["✓", "Тему уже практиковали на занятиях"],
        ["○", "Знакомство: правило показано, но ещё не отрабатывали"],
        ["[[English]]", "Английские слова и примеры выделены синим"],
        ["{{ошибка}}", "Неверный вариант: красный и зачёркнутый"],
    ], [0.22, 0.78]),
    ("p", "<b>Как проходит занятие.</b> Разминка 3 минуты: простые вопросы про твой день. Основная часть 15–20 минут: разговор на тему, я мягко поправляю ошибки и называю номер правила. Итог 3 минуты: 3–5 новых слов и главные ошибки дня."),
    ("p", "<b>Как закрепляем.</b> Слова и фразы из учебника есть в приложении English Trainer на телефоне. Они возвращаются через 1, 3, 7, 14 и 30 дней: так запоминание держится дольше, чем при одном чтении."),
]

CHAPTERS = [
    dict(n=1, title="Предложение и глагол", status="done",
         intro="Самое важное правило английского: без глагола предложения не бывает.",
         sections=[
             dict(h="Порядок слов", blocks=[
                 ("p", "Порядок простой: <b>кто → что делает → что или где</b>."),
                 ("ex", [("I check sales.", "Я проверяю продажи."),
                         ("My software helps sellers.", "Моя программа помогает продавцам.")]),
             ]),
             dict(h="В каждом предложении есть глагол", blocks=[
                 ("rule", "В английском предложении всегда должен быть глагол. Два обычных глагола подряд ставить нельзя."),
                 ("warn", [("I make now is Imabu software", "I'm working on Imabu software right now.",
                            "здесь подряд идут make и is; нужен один глагол в нужной форме (см. главу 3)")]),
             ]),
             dict(h="Глагол «быть»: am / is / are", blocks=[
                 ("p", "По-русски можно сказать без глагола: «Программа красивая». По-английски глагол «быть» обязателен."),
                 ("table", ["Кто", "Форма", "Пример"], [
                     ["I", "am (I'm)", "[[I'm a seller.]]"],
                     ["he / she / it, один предмет", "is", "[[The program is beautiful.]]"],
                     ["we / you / they, много", "are", "[[Sellers are busy.]]"],
                 ], [0.34, 0.2, 0.46]),
                 ("tip", "Про прошлое: был / была = [[was]], были = [[were]] (глава 4)."),
             ]),
             dict(h="Выбирай глагол по смыслу", blocks=[
                 ("p", "«Показывает» по-английски [[shows]], а не [[makes]]. Если сомневаешься, спроси у меня: «как сказать …»."),
                 ("warn", [("My software make it all", "My software shows all of this.", "show = показывать; к software добавляем -s")]),
             ]),
         ]),

    dict(n=2, title="Привычка и факты: Present Simple", status="done",
         intro="Что происходит регулярно, обычно или всегда.",
         sections=[
             dict(h="Когда используем", blocks=[
                 ("p", "Привычка, регулярное действие, общий факт. Слова-подсказки: [[every day]], [[daily]], [[usually]], [[always]], [[often]], [[sometimes]]."),
                 ("ex", [("I use it every day.", "Я пользуюсь этим каждый день."),
                         ("I check sales, stock, logistics, and ad spend.", "Я проверяю продажи, остатки, логистику и расходы на рекламу.")]),
             ]),
             dict(h="Формы глагола", blocks=[
                 ("rule", "С <b>I / you / we / they</b> глагол без изменений. С <b>he / she / it</b> (и с одним предметом, например software) к глаголу добавляем <b>-s</b>."),
                 ("table", ["Кто", "Форма", "Пример"], [
                     ["I / you / we / they", "глагол", "[[I use it.]]  [[Sellers check sales.]]"],
                     ["he / she / it / software", "глагол + s", "[[She uses it.]]  [[My software shows sales.]]"],
                 ], [0.34, 0.2, 0.46]),
             ]),
             dict(h="Как добавлять -s", blocks=[
                 ("table", ["Глагол оканчивается на", "Что делаем", "Примеры"], [
                     ["обычно", "+ s", "show → [[shows]], help → [[helps]], use → [[uses]]"],
                     ["s, sh, ch, x, o", "+ es", "fix → [[fixes]], watch → [[watches]], go → [[goes]]"],
                     ["согласная + y", "y → ies", "study → [[studies]]"],
                     ["особые", "", "have → [[has]], do → [[does]]"],
                 ], [0.3, 0.2, 0.5]),
             ]),
             dict(h="Твоя типичная ошибка", blocks=[
                 ("warn", [("My software help seller its work", "My software helps sellers work.",
                            "helps (с -s), sellers (много продавцов), после help второй глагол без to и без its")]),
             ]),
         ]),

    dict(n=3, title="Прямо сейчас: Present Continuous", status="done",
         intro="Что происходит в эту минуту. И главный вопрос: I или I'm?",
         sections=[
             dict(h="Когда используем", blocks=[
                 ("p", "Действие идёт прямо сейчас. Слова-подсказки: [[now]], [[right now]], [[at the moment]]."),
                 ("ex", [("I'm working on Imabu software right now.", "Я сейчас работаю над программой Imabu."),
                         ("It is loading.", "Оно загружается.")]),
             ]),
             dict(h="Формула", blocks=[
                 ("rule", "<b>am / is / are + глагол-ing</b>. Помощник (am / is / are) обязателен: без него {{I working}} будет ошибкой."),
                 ("table", ["Кто", "Форма", "Пример"], [
                     ["I", "am + ing", "[[I'm working.]]"],
                     ["he / she / it", "is + ing", "[[It is loading.]]"],
                     ["we / you / they", "are + ing", "[[Sellers are checking stats.]]"],
                 ], [0.3, 0.22, 0.48]),
             ]),
             dict(h="Как добавлять -ing", blocks=[
                 ("table", ["Что делаем", "Примеры"], [
                     ["обычно + ing", "work → [[working]], check → [[checking]]"],
                     ["на -e убираем e", "make → [[making]], use → [[using]]"],
                     ["короткий глагол: удваиваем согласную", "run → [[running]], stop → [[stopping]]"],
                 ], [0.45, 0.55]),
             ]),
             dict(h="I или I'm?", blocks=[
                 ("p", "<b>I'm</b> это сокращение от <b>I am</b>, то есть уже готовый глагол. Поэтому после него нельзя ставить простой глагол."),
                 ("table", ["Что говорю", "Форма", "Пример"], [
                     ["Привычка, регулярно", "I + глагол", "[[I use it every day.]]"],
                     ["Происходит сейчас", "I'm + глагол-ing", "[[I'm using it now.]]"],
                     ["Кто я / какой я", "I'm + слово", "[[I'm a seller.]]  [[I'm tired.]]"],
                 ], [0.32, 0.26, 0.42]),
                 ("tip", "Быстрый тест: у слова после I есть -ing? Тогда I'm. Простой глагол? Тогда просто I. «I'm» + простой глагол всегда ошибка."),
                 ("warn", [("I'm use this every day", "I use it every day.", "это привычка (every day), -ing не нужен"),
                           ("I working today", "I'm working today.  /  I worked today.", "перед -ing нужен am; для завершённого дня подойдёт и прошедшее")]),
             ]),
             dict(h="Простое или длительное: сравни", blocks=[
                 ("table", ["Каждый день", "Прямо сейчас"], [
                     ["[[I check sales every morning.]]\nЯ проверяю продажи каждое утро.", "[[I'm checking sales now.]]\nЯ сейчас проверяю продажи."],
                     ["[[I use it daily.]]\nЯ пользуюсь этим ежедневно.", "[[I'm using it now.]]\nЯ пользуюсь этим сейчас."],
                 ], [0.5, 0.5]),
             ]),
             dict(h="Глаголы, которые обычно без -ing", blocks=[
                 ("p", "Глаголы чувств и желаний обычно не употребляют с -ing: [[like]], [[want]], [[need]], [[know]]. Говорим [[I like it]], а не {{I'm liking it}}."),
             ]),
         ]),

    dict(n=4, title="Прошедшее время: Past Simple", status="done",
         intro="Что было и уже закончилось.",
         sections=[
             dict(h="Обычные глаголы: + ed", blocks=[
                 ("table", ["Правило", "Примеры"], [
                     ["обычно + ed", "work → [[worked]], fix → [[fixed]], check → [[checked]], add → [[added]]"],
                     ["на -e только + d", "like → [[liked]], use → [[used]]"],
                     ["согласная + y → ied", "study → [[studied]]"],
                 ], [0.35, 0.65]),
                 ("ex", [("Today I worked on Imabu.", "Сегодня я работал над Imabu."),
                         ("Today I fixed small bugs.", "Сегодня я исправил небольшие баги.")]),
             ]),
             dict(h="Был / была / было / были", blocks=[
                 ("table", ["Кто", "Форма"], [
                     ["I / he / she / it", "[[was]]"],
                     ["we / you / they", "[[were]]"],
                 ], [0.5, 0.5]),
                 ("ex", [("My day was normal.", "Мой день был обычным."),
                         ("How was your day today?", "Как прошёл твой день сегодня?")]),
                 ("warn", [("My day is normal", "My day was normal.", "вечер, день уже прошёл, значит прошлое: was")]),
             ]),
             dict(h="Особые глаголы (учим по мере встречи)", blocks=[
                 ("table", ["Сейчас", "Прошлое"], [
                     ["go", "[[went]]"], ["have", "[[had]]"], ["do", "[[did]]"],
                     ["make", "[[made]]"], ["see", "[[saw]]"], ["get", "[[got]]"],
                 ], [0.5, 0.5]),
             ]),
             dict(h="Слова-подсказки", blocks=[
                 ("p", "[[yesterday]], [[last week]], [[today]] (если уже закончилось)."),
                 ("warn", [("Today i fix is small mistakes and bags", "Today I fixed small mistakes and bugs.",
                            "fixed (прошлое), I с большой буквы, лишнее is убрать, bug ≠ bag")]),
             ]),
         ]),

    dict(n=5, title="Будущее: will", status="intro",
         intro="Что будет. Самая простая форма.",
         sections=[
             dict(h="Формула", blocks=[
                 ("rule", "<b>will + глагол без изменений</b>. После will никогда не добавляем -s."),
                 ("ex", [("In the end, this program will be beautiful.", "В итоге эта программа будет красивой."),
                         ("I will check it tomorrow.", "Я проверю это завтра.")]),
                 ("tip", "Коротко: I will → [[I'll]]. Слова-подсказки: [[tomorrow]], [[next week]], [[soon]]."),
             ]),
         ]),

    dict(n=6, title="Вопросы", status="intro",
         intro="Как задать вопрос и не поставить лишнее -s.",
         sections=[
             dict(h="Настоящее время: do / does", blocks=[
                 ("rule", "<b>Do</b> + I / you / we / they + глагол?   <b>Does</b> + he / she / it + глагол? После do / does глагол <b>без -s</b>."),
                 ("ex", [("Do you use it every day?", "Ты пользуешься этим каждый день?"),
                         ("Does it show profit?", "Она показывает прибыль?"),
                         ("What does your software do?", "Что делает твоя программа?")]),
                 ("warn", [("Does it shows profit?", "Does it show profit?", "-s уже «переехало» в does")]),
             ]),
             dict(h="С глаголом «быть»: меняем порядок", blocks=[
                 ("ex", [("Is it convenient?", "Это удобно?"),
                         ("How was your day today?", "Как прошёл твой день сегодня?")]),
             ]),
             dict(h="Прошедшее время: did", blocks=[
                 ("ex", [("Did you fix the bug?", "Ты исправил баг?")]),
                 ("tip", "После did глагол в обычной форме: [[Did you fix]], а не {{Did you fixed}}."),
             ]),
             dict(h="Вопросительные слова", blocks=[
                 ("table", ["Слово", "Значит", "Пример из занятий"], [
                     ["what", "что", "[[What do you do?]]"],
                     ["why", "почему", "[[Why do you like the app?]]"],
                     ["how", "как", "[[How was your day today?]]"],
                     ["when", "когда", "[[What do you do when sales go down?]]"],
                     ["what ... first", "что первым делом", "[[What is the first thing you check in the morning?]]"],
                 ], [0.2, 0.2, 0.6]),
             ]),
         ]),

    dict(n=7, title="Отрицание", status="intro",
         intro="Как сказать «не».",
         sections=[
             dict(h="Формулы", blocks=[
                 ("table", ["Время", "Форма", "Пример"], [
                     ["сейчас, I / you / we / they", "don't + глагол", "[[I don't use it.]]"],
                     ["сейчас, he / she / it", "doesn't + глагол (без -s)", "[[It doesn't work.]]"],
                     ["глагол «быть»", "am / is / are + not", "[[I'm not tired.]]  [[It isn't ready.]]"],
                     ["прошлое", "didn't + глагол", "[[I didn't fix it.]]"],
                     ["будущее", "won't + глагол", "[[It won't be easy.]]"],
                 ], [0.3, 0.3, 0.4]),
             ]),
         ]),

    dict(n=8, title="Артикли: a / an / the", status="intro",
         intro="Маленькие слова, на которых чаще всего ошибаются.",
         sections=[
             dict(h="a / an: один из многих", blocks=[
                 ("p", "Впервые упоминаем предмет или говорим «какой-то». <b>a</b> перед согласным звуком, <b>an</b> перед гласным."),
                 ("ex", [("I found a bug.", "Я нашёл баг."), ("It is an app.", "Это приложение.")]),
             ]),
             dict(h="the: конкретный, известный обоим", blocks=[
                 ("ex", [("I found a bug. The bug is small.", "Я нашёл баг. Баг небольшой."),
                         ("I like the app.", "Мне нравится это приложение."),
                         ("I check all the statistics.", "Я проверяю всю статистику.")]),
             ]),
             dict(h="Без артикля: вообще", blocks=[
                 ("p", "Когда говорим вообще (множественное число и неисчисляемые слова) артикль не нужен."),
                 ("ex", [("I like statistics.", "Мне нравится статистика."), ("Sales go down.", "Продажи падают.")]),
                 ("warn", [("I check all statistics sheets", "I check all the statistics.", "речь о конкретных данных, нужен the")]),
             ]),
         ]),

    dict(n=9, title="Сравнение прилагательных", status="done",
         intro="Круче, быстрее, красивее.",
         sections=[
             dict(h="Три способа", blocks=[
                 ("table", ["Какие слова", "Что делаем", "Примеры"], [
                     ["короткие", "+ er", "cool → [[cooler]], fast → [[faster]], easy → [[easier]], big → [[bigger]]"],
                     ["длинные", "more + слово", "[[more beautiful]], [[more convenient]], [[more interesting]]"],
                     ["особые", "запомнить", "good → [[better]], bad → [[worse]]"],
                 ], [0.2, 0.25, 0.55]),
                 ("ex", [("I like making software better.", "Мне нравится делать программу лучше."),
                         ("The app is cooler than before.", "Приложение круче, чем раньше.")]),
                 ("warn", [("more cool", "cooler", "короткое слово: добавляем -er")]),
             ]),
         ]),

    dict(n=10, title="Полезные конструкции", status="done",
         intro="Готовые шаблоны, которые помогают строить длинные предложения.",
         sections=[
             dict(h="like + глагол-ing", blocks=[
                 ("ex", [("I like making software better.", "Мне нравится делать программу лучше.")]),
             ]),
             dict(h="want + to + глагол", blocks=[
                 ("ex", [("I want to add a new chart.", "Я хочу добавить новый график.")]),
             ]),
             dict(h="because: причина", blocks=[
                 ("ex", [("I like it because it is convenient.", "Мне это нравится, потому что это удобно."),
                         ("I like it because it makes the software cooler.", "Мне это нравится, потому что программа становится круче.")]),
                 ("warn", [("I like it make sowtware is more cool", "I like it because it makes the software cooler.",
                            "нужен because + целое предложение, makes с -s, cooler")]),
             ]),
             dict(h="when: «когда»", blocks=[
                 ("ex", [("When sales go down, I check all the statistics.", "Когда продажи падают, я проверяю всю статистику.")]),
                 ("tip", "Если предложение начинается с when, после него ставим запятую."),
             ]),
             dict(h="Перечисление", blocks=[
                 ("ex", [("I check sales, stock, logistics, and ad spend.", "Я проверяю продажи, остатки, логистику и расходы на рекламу.")]),
                 ("tip", "Перед последним пунктом ставим [[and]]."),
             ]),
             dict(h="Вводные слова", blocks=[
                 ("ex", [("In the end, this program will be beautiful.", "В итоге эта программа будет красивой."),
                         ("The first thing I check is sales.", "Первым делом я проверяю продажи.")]),
             ]),
             dict(h="Знакомство и прощание", blocks=[
                 ("table", ["Фраза", "Когда"], [
                     ["[[Nice to meet you.]]  [[Nice to meet you too.]]", "при знакомстве"],
                     ["[[See you.]]  [[See you tomorrow.]]  [[See you later.]]", "при прощании: «до встречи»"],
                     ["[[Good night.]]", "перед сном"],
                 ], [0.6, 0.4]),
                 ("warn", [("See you too", "Nice to meet you too.", "See you = «до встречи» (прощание); при знакомстве говорим Nice to meet you")]),
             ]),
         ]),

    dict(n=11, title="Предлоги, мелочи и слова-ловушки", status="done",
         intro="Короткие слова, которые часто путаются.",
         sections=[
             dict(h="Предлоги", blocks=[
                 ("table", ["Что говорим", "Как"], [
                     ["работать над", "[[work on]]: [[I'm working on Imabu.]]"],
                     ["на маркетплейсе", "[[on]]: [[sellers on Wildberries and Ozon]]"],
                     ["утром, вечером", "[[in the morning]], [[in the evening]], [[at night]]"],
                     ["каждый день", "[[every day]] без предлога"],
                     ["помогать работать", "[[help sellers work]]  или  [[help sellers with their work]]"],
                 ], [0.35, 0.65]),
             ]),
             dict(h="app или software?", blocks=[
                 ("p", "<b>app</b> это приложение на телефоне. <b>software</b> это программное обеспечение вообще, например Imabu software."),
                 ("ex", [("I like the app.", "Мне нравится приложение."), ("Imabu software shows sales.", "Программа Imabu показывает продажи.")]),
             ]),
             dict(h="Слова, в которых легко ошибиться", blocks=[
                 ("table", ["Неверно", "Верно", "Подсказка"], [
                     ["{{softweare}}, {{sowtware}}", "[[software]]", "soft + ware, без лишней e"],
                     ["{{beautifull}}", "[[beautiful]]", "одно l на конце"],
                     ["{{tooday}}", "[[today]]", "одно o в середине"],
                     ["{{bag}} (сумка)", "[[bug]] (баг)", "bug произносится «баг»"],
                 ], [0.3, 0.25, 0.45]),
             ]),
         ]),
]

# Словарь по темам: id карточек из cards.json (все слова должны попасть в какую-то тему)
VOCAB_THEMES = [
    ("Продажи и маркетплейсы", ["seller", "sales", "profit", "ads", "adspend", "stock", "nostock", "logistics",
                                 "competitors", "highprice", "badreviews", "reason", "godown", "goup"]),
    ("Программа и работа", ["software", "app", "bug", "mistake", "fix", "add", "feature", "chart", "alert",
                             "report", "statistics", "check", "show", "help"]),
    ("Общие слова", ["small", "beautiful", "better", "cooler", "convenient", "impression", "daily",
                      "firstthing", "intheend", "because"]),
]

# Журнал ошибок: (дата, было, стало, где разобрано)
MISTAKES = [
    ("12.11", "See you too", "Nice to meet you too.", "10.7"),
    ("12.11", "I make now is Imabu software", "I'm working on Imabu software right now.", "1.2, 3.2"),
    ("12.11", "softweare", "software", "11.3"),
    ("12.11", "My softweare help seller its work", "My software helps sellers work.", "2.2, 2.4"),
    ("12.11", "My software make it all is", "My software shows all of this.", "1.4, 2.2"),
    ("12.11", "I check all statistics sheets", "I check all the statistics.", "8"),
    ("13.11", "My day is normal", "My day was normal.", "4.2"),
    ("13.11", "I working tooday", "I'm working today. / I worked today.", "3.2, 4.1"),
    ("13.11", "beautifull", "beautiful", "11.3"),
    ("13.11", "Today i fix is small mistakes and bags", "Today I fixed small mistakes and bugs.", "4.4, 11.3"),
    ("13.11", "I like it make sowtware is more cool", "I like it because it makes the software cooler.", "9, 10"),
    ("14.11", "I'm use this every day", "I use it every day.", "3.4"),
]

# Журнал занятий: (дата, название, что прошли)
LESSONS = [
    ("12 ноября", "Знакомство", "Рассказали о программе Imabu и о том, что ты проверяешь в течение дня. Грамматика: -s у глагола (software shows), I'm + -ing, the."),
    ("13 ноября", "Рабочий день и баги", "Прошедшее время (-ed, was), сравнение (cooler, better), like + -ing, because. Собрали приложение English Trainer."),
    ("14 ноября", "Первое впечатление", "App или software. Разобрали «привычка или прямо сейчас» и I или I'm. Собрали этот учебник."),
]

NEXT_STEPS = [
    "Отработать главы 5–8 (будущее, вопросы, отрицания, артикли) на примерах из твоей работы.",
    "Добавить технический английский: меню, настройки, сообщения об ошибках («Settings → Advanced → Reset»).",
    "Постепенно перейти на разговор без перевода: сначала английский с подсказками, потом только английский.",
]
