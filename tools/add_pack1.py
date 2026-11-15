# -*- coding: utf-8 -*-
"""Добавляет в cards.json пакеты 1: core1 («Ядро речи») и ui1 («Интерфейс и техника»).
Идемпотентно: карточки с уже существующим id пропускаются.
Запуск: python3 -I tools/add_pack1.py cards.json
Каждая карточка — готовая фраза-связка (не одиночное слово); в note — грамматический крючок (глава учебника).
"""
import json, sys

LESSON = "2026-11-15"

# (id, en, ru, ex, exRu, note, alts)
CORE = [
 ("need", "I need to check the stock.", "Мне нужно проверить остатки.", "I need to update the app first.", "Сначала мне нужно обновить приложение.",
  "Шаблон: need + to + глагол без окончаний (гл. 10). Не «I need check».", ["I need to check stocks."]),
 ("trying", "I'm trying to fix this bug.", "Я пытаюсь исправить этот баг.", "I'm trying to open the file, but it doesn't work.", "Я пытаюсь открыть файл, но не получается.",
  "I'm + trying (гл. 3), дальше to + глагол. this bug: конкретный баг (гл. 8).", ["I am trying to fix this bug.", "I'm trying to fix the bug.", "I am trying to fix the bug."]),
 ("canhelp", "Can you help me?", "Ты можешь мне помочь?", "Can you help me with this error?", "Можешь помочь мне с этой ошибкой?",
  "can + глагол без -s: «Can you help», не «Can you helps». help me, а не «help to me». Помочь с чем-то: with (гл. 11).", ["Could you help me?"]),
 ("whatmean", "What does this word mean?", "Что значит это слово?", "What does 'permission' mean?", "Что значит «permission»?",
  "Вопрос с does: после does глагол без -s (mean, не means) (гл. 6).", ["What does the word mean?", "What does this mean?"]),
 ("howdoi", "How do I turn it off?", "Как мне это выключить?", "How do I change the language?", "Как мне сменить язык?",
  "How do I + глагол: вопрос «как мне сделать» (гл. 6).", ["How can I turn it off?", "How do I turn this off?"]),
 ("dontunderstand", "I don't understand this word.", "Я не понимаю это слово.", "Sorry, I don't understand.", "Извини, я не понимаю.",
  "Отрицание: don't + глагол без окончаний (гл. 7).", ["I do not understand this word."]),
 ("sayagain", "Could you say that again?", "Можешь повторить ещё раз?", "Could you say that again, please? I didn't catch it.", "Повтори, пожалуйста. Я не расслышал.",
  "Could вежливее, чем can. «Say that again» = повторить.", ["Can you say that again?", "Could you repeat that?", "Could you say it again?"]),
 ("notsure", "I'm not sure.", "Я не уверен.", "I'm not sure about this price.", "Я не уверен насчёт этой цены.",
  "am + not + прилагательное (гл. 1). Насчёт чего-то: about (гл. 11).", ["I am not sure."]),
 ("thinkso", "I think so.", "Я так думаю.", "Is it a bug? I think so.", "Это баг? Думаю, да.",
  "Короткий ответ вместо «yes». Противоположное: I don't think so.", []),
 ("letmecheck", "Let me check.", "Дай-ка я проверю.", "Let me check the sales for you.", "Дай я проверю продажи.",
  "Let me + глагол без to и без окончаний (гл. 1).", ["Let me check it."]),
 ("moment", "Just a moment, please.", "Минутку, пожалуйста.", "Just a moment. I'm loading the report.", "Минутку. Я загружаю отчёт.",
  "a moment: артикль a (гл. 8). Вежливо и коротко.", ["Just a moment.", "One moment, please."]),
 ("makessense", "That makes sense.", "Это логично. / Понятно.", "Oh, now it makes sense.", "А, теперь понятно.",
  "that + makes (he/she/it + s, гл. 2). Очень частая реакция в разговоре.", ["It makes sense."]),
 ("depends", "It depends on the price.", "Это зависит от цены.", "It depends. What do you need?", "Зависит от обстоятельств. Что тебе нужно?",
  "depends on = зависит от (предлог on, гл. 11); it + depends (-s, гл. 2).", []),
 ("doesntwork", "The button doesn't work.", "Кнопка не работает.", "It doesn't work on my phone.", "На моём телефоне это не работает.",
  "Одно число: doesn't + work без -s (гл. 7). Много предметов: don't work.", ["This button doesn't work.", "The button does not work."]),
 ("whathappened", "What happened?", "Что случилось?", "What happened to the file?", "Что случилось с файлом?",
  "happened: прошедшее (-ed, гл. 4). Вопрос «what happened» без did: what здесь подлежащее.", []),
 ("forgot", "I forgot to save the file.", "Я забыл сохранить файл.", "Sorry, I forgot to answer.", "Извини, я забыл ответить.",
  "forgot = прошедшее от forget (особый глагол), дальше to + глагол (гл. 4, 10). the file: известный файл (гл. 8).", ["I forgot to save the file."]),
 ("lookingfor", "I'm looking for a new supplier.", "Я ищу нового поставщика.", "I'm looking for the settings.", "Я ищу настройки.",
  "look for = искать (предлог for, гл. 11). a new supplier: любой новый (a, гл. 8).", ["I am looking for a new supplier."]),
 ("goingto", "I'm going to update the app.", "Я собираюсь обновить приложение.", "I'm going to check the stock tomorrow.", "Завтра я собираюсь проверить остатки.",
  "Планы: I'm going to + глагол. Рядом с will (гл. 5): going to = уже решил, will = решил сейчас.", ["I am going to update the app."]),
 ("takes", "It takes five minutes.", "Это занимает пять минут.", "It takes a long time to load.", "Загрузка занимает много времени.",
  "it + takes (-s, гл. 2). a long time: a (гл. 8).", ["It takes 5 minutes."]),
 ("howlong", "How long does it take?", "Сколько это займёт?", "How long does the update take?", "Сколько займёт обновление?",
  "Вопрос с does: take без -s (гл. 6). How long = как долго.", ["How long does it take?"]),
 ("looksgood", "It looks good.", "Выглядит хорошо.", "The new design looks good.", "Новый дизайн выглядит хорошо.",
  "looks: it/he/she + -s (гл. 2). После look/looks идёт прилагательное (good), не наречие.", ["This looks good.", "It looks great."]),
 ("idlike", "I'd like to ask a question.", "Я бы хотел задать вопрос.", "I'd like to change the price.", "Я бы хотел изменить цену.",
  "I'd like = вежливое I want (гл. 10). a question: a (гл. 8). ask a question, не «make».", ["I would like to ask a question."]),
 ("whatthink", "What do you think?", "Как ты думаешь?", "What do you think about this idea?", "Что ты думаешь об этой идее?",
  "Вопрос с do: think без -s (гл. 6). Думать о чём-то: think about (гл. 11).", []),
 ("agree", "I agree with you.", "Я с тобой согласен.", "I don't agree with this price.", "Я не согласен с этой ценой.",
  "agree with + кто/что: предлог with (гл. 11). Не «I am agree».", ["I agree."]),
 ("thanksfor", "Thanks for your help.", "Спасибо за помощь.", "Thanks for the answer.", "Спасибо за ответ.",
  "Спасибо за что-то: thanks FOR (гл. 11).", ["Thank you for your help.", "Thanks for the help."]),
 ("noproblem", "No problem.", "Без проблем.", "Sorry I'm late. — No problem.", "Извини, что опоздал. — Без проблем.",
  "Ответ на «спасибо» и «извини». Ещё: no worries.", ["No worries."]),
 ("mistake", "I'm sorry, I made a mistake.", "Извини, я ошибся.", "I made a small mistake in the price.", "Я сделал небольшую ошибку в цене.",
  "made = прошедшее от make; a mistake: a (гл. 4, 8). «Make a mistake», не «do a mistake».", ["Sorry, I made a mistake."]),
 ("difference", "What's the difference between these two?", "В чём разница между этими двумя?", "What's the difference between an app and software?", "В чём разница между app и software?",
  "between + два предмета (гл. 11). the difference: the (гл. 8).", ["What is the difference between these two?"]),
 ("haveq", "I have a question.", "У меня есть вопрос.", "I have a question about the price.", "У меня вопрос о цене.",
  "have a question: a (гл. 8). Вопрос о чём-то: about (гл. 11).", []),
 ("askq", "Can I ask you something?", "Можно тебя кое о чём спросить?", "Can I ask you something about this error?", "Можно спросить тебя кое о чём про эту ошибку?",
  "Can I + глагол без to (гл. 6). something = что-то.", ["Can I ask something?", "Can I ask you a question?"]),
 ("usually", "I usually check sales in the morning.", "Обычно я проверяю продажи утром.", "I usually start work at nine.", "Обычно я начинаю работу в девять.",
  "usually стоит перед глаголом (гл. 2). Утром: in the morning, а не «on» (гл. 11).", ["Usually I check sales in the morning."]),
]

UI = [
 ("click", "Click the button.", "Нажми на кнопку.", "Click the button to save your changes.", "Нажми на кнопку, чтобы сохранить изменения.",
  "Команда: глагол без I и без to (гл. 1). the button: конкретная кнопка на экране (гл. 8).", ["Click on the button.", "Press the button.", "Tap the button."]),
 ("opensettings", "Open the settings.", "Открой настройки.", "Open the settings and choose a language.", "Открой настройки и выбери язык.",
  "the settings: настройки конкретного приложения, всегда the (гл. 8). open ≠ opened (команда).", ["Open settings.", "Open the settings."]),
 ("closewindow", "Close the window.", "Закрой окно.", "Close the window and try again.", "Закрой окно и попробуй снова.",
  "the window: то окно, которое ты видишь (гл. 8).", ["Close this window."]),
 ("selectfile", "Select a file.", "Выбери файл.", "Select a file from your computer.", "Выбери файл на компьютере.",
  "a file: любой файл (a, гл. 8). Файл с компьютера: from your computer (гл. 11).", ["Choose a file."]),
 ("savechanges", "Save the changes.", "Сохрани изменения.", "Don't forget to save the changes.", "Не забудь сохранить изменения.",
  "the changes: именно твои изменения (the, гл. 8). Changes всегда во множественном числе.", ["Save your changes."]),
 ("copypaste", "Copy and paste the text.", "Скопируй и вставь текст.", "Copy the link and paste it here.", "Скопируй ссылку и вставь её сюда.",
  "Два глагола соединяет and (гл. 1: «cook and eat»).", ["Copy and paste."]),
 ("signin", "Sign in to your account.", "Войди в свой аккаунт.", "You need to sign in first.", "Сначала нужно войти.",
  "sign in TO + аккаунт (гл. 11). Синоним: log in.", ["Log in to your account.", "Sign in to your account."]),
 ("signout", "Sign out of your account.", "Выйди из аккаунта.", "Sign out and sign in again.", "Выйди и войди снова.",
  "sign out OF + аккаунт (гл. 11): войти в = to, выйти из = of.", ["Log out of your account.", "Sign out."]),
 ("turnoff", "Turn off the notifications.", "Выключи уведомления.", "Turn it off and turn it on again.", "Выключи и включи снова.",
  "turn on = включить, turn off = выключить. С it: turn IT off, не «turn off it».", ["Turn the notifications off.", "Turn off notifications."]),
 ("attach", "Attach a file to the message.", "Прикрепи файл к сообщению.", "I want to attach a screenshot.", "Я хочу прикрепить скриншот.",
  "attach a file TO + что (гл. 11). a file, a screenshot: a (гл. 8).", ["Attach a file."]),
 ("upload", "Upload the file.", "Загрузи файл (на сервис).", "Upload the file to the cloud.", "Загрузи файл в облако.",
  "upload = загрузить с себя на сервис, download = скачать себе. В облако: to the cloud (гл. 11).", ["Upload a file."]),
 ("download", "Download the file.", "Скачай файл.", "Download the file and open it.", "Скачай файл и открой его.",
  "download = скачать на своё устройство. and между действиями (гл. 1).", ["Download a file."]),
 ("searchfor", "Search for a chat.", "Найди чат (через поиск).", "Search for the file by name.", "Найди файл по названию.",
  "search FOR + что ищешь (гл. 11). По названию: by name.", ["Search for the chat."]),
 ("deletechat", "Delete the chat.", "Удали чат.", "Are you sure you want to delete this chat?", "Ты уверен, что хочешь удалить этот чат?",
  "delete = удалить. this chat: конкретный чат (гл. 8).", ["Delete this chat."]),
 ("rename", "Rename the project.", "Переименуй проект.", "I want to rename this file.", "Я хочу переименовать этот файл.",
  "rename = re + name. the project: известный проект (гл. 8).", ["Rename this project."]),
 ("goback", "Go back.", "Вернись назад.", "Go back to the main screen.", "Вернись на главный экран.",
  "go back TO + куда (гл. 11). Назад: back.", []),
 ("scroll", "Scroll down.", "Прокрути вниз.", "Scroll down to see more.", "Прокрути вниз, чтобы увидеть больше.",
  "scroll down = вниз, scroll up = вверх. to see = чтобы увидеть (цель, гл. 10).", ["Scroll down the page."]),
 ("choosemodel", "Choose a model.", "Выбери модель.", "Choose a model from the list.", "Выбери модель из списка.",
  "a model: любая модель (a, гл. 8). Из списка: from the list (гл. 11).", ["Select a model."]),
 ("updateavail", "An update is available.", "Доступно обновление.", "A new version is available.", "Доступна новая версия.",
  "an update: слово начинается с гласного звука, поэтому an (гл. 8). is available (гл. 1).", ["Update available."]),
 ("restart", "Restart the app.", "Перезапусти приложение.", "Restart the app to finish the update.", "Перезапусти приложение, чтобы закончить обновление.",
  "app = приложение на телефоне/компьютере (гл. 11). to finish = чтобы закончить (гл. 10).", ["Restart the application."]),
 ("checkupdates", "Check for updates.", "Проверь обновления.", "The app checks for updates every day.", "Приложение проверяет обновления каждый день.",
  "check FOR updates (гл. 11). updates: во множественном числе.", ["Check for an update."]),
 ("wentwrong", "Something went wrong.", "Что-то пошло не так.", "Something went wrong. Please try again.", "Что-то пошло не так. Попробуй ещё раз.",
  "went = прошедшее от go (особый глагол, гл. 4). Самое частое сообщение об ошибке.", []),
 ("tryagain", "Please try again later.", "Пожалуйста, попробуй позже.", "Try again in a few minutes.", "Попробуй снова через несколько минут.",
  "try again = попробовать снова. in a few minutes = через пару минут (in, гл. 11).", ["Try again later.", "Please try again."]),
 ("failedload", "The page failed to load.", "Страница не загрузилась.", "The image failed to load.", "Картинка не загрузилась.",
  "failed = прошедшее (-ed, гл. 4), дальше to + глагол (гл. 10). the page: конкретная страница (гл. 8).", ["It failed to load.", "The page didn't load."]),
 ("connection", "Check your internet connection.", "Проверь подключение к интернету.", "There is a connection error.", "Ошибка соединения.",
  "check + что проверяешь (check your connection). Проверить, есть ли что-то: check FOR (check for updates, гл. 11). a connection error: a (гл. 8).", ["Check your connection."]),
 ("allow", "Allow access to your files?", "Разрешить доступ к твоим файлам?", "Click Allow to continue.", "Нажми Allow, чтобы продолжить.",
  "access TO + что (гл. 11). Allow = разрешить, Deny = отклонить.", ["Allow access to files?"]),
 ("permission", "Permission denied.", "Доступ запрещён.", "I don't have permission to open this folder.", "У меня нет прав, чтобы открыть эту папку.",
  "permission = разрешение / права; denied = отказано (гл. 4: форма -ed). Не путать с «permit».", ["Access denied."]),
 ("notfound", "The file was not found.", "Файл не найден.", "The page was not found.", "Страница не найдена.",
  "was not found = пассивная форма, учим как готовую фразу (гл. 4: was). the file: известный файл (гл. 8).", ["File not found.", "The file wasn't found."]),
 ("password", "Enter your password.", "Введи пароль.", "Enter your email and password.", "Введи почту и пароль.",
  "enter + что вводишь, без предлога (не «enter in password»). your: перед ним артикль не нужен (гл. 8).", ["Type your password."]),
 ("areyousure", "Are you sure you want to delete it?", "Ты уверен, что хочешь это удалить?", "Are you sure you want to leave?", "Ты уверен, что хочешь выйти?",
  "Вопрос с are (гл. 6). После sure: you want to + глагол (гл. 10).", ["Are you sure?"]),
 ("notresponding", "The app is not responding.", "Приложение не отвечает.", "The page is not responding.", "Страница не отвечает.",
  "is not responding = Present Continuous: is + -ing (гл. 3). Приложение «завис».", ["The app isn't responding."]),
 ("loading", "It is loading.", "Загружается.", "The page is still loading.", "Страница всё ещё загружается.",
  "is + loading (гл. 3). still = всё ещё, стоит между is и -ing.", ["It's loading.", "Loading."]),
 ("reload", "Reload the page.", "Перезагрузи страницу.", "Reload the page and try again.", "Перезагрузи страницу и попробуй снова.",
  "re + load = загрузить заново. the page: страница, на которой ты сейчас (гл. 8).", ["Refresh the page."]),
 ("latest", "Update to the latest version.", "Обнови до последней версии.", "I use the latest version of the app.", "Я использую последнюю версию приложения.",
  "update TO + версия (гл. 11). the latest version: the + самый-самый (гл. 8, 9).", ["Update to the newest version."]),
 ("reportbug", "I want to report a bug.", "Я хочу сообщить об ошибке.", "Report a bug in the settings.", "Сообщи об ошибке в настройках.",
  "report a bug: a (гл. 8). bug = ошибка в программе (не «bag», гл. 11). want + to + глагол (гл. 10).", ["Report a bug.", "I want to report an error."]),
 ("newchat", "Start a new chat.", "Начни новый чат.", "I open a new chat every day.", "Я открываю новый чат каждый день.",
  "a new chat: любой новый (a, гл. 8). every day = каждый день (гл. 2).", ["Open a new chat.", "Start a new conversation."]),
 ("sendmsg", "Type your message and press Enter.", "Напиши сообщение и нажми Enter.", "Send a message to Claude.", "Отправь сообщение Claude.",
  "Два действия через and (гл. 1). send TO кому (гл. 11).", ["Type a message and press Enter."]),
 ("retry", "Click Retry to try again.", "Нажми Retry, чтобы попробовать снова.", "Click Stop to stop the response.", "Нажми Stop, чтобы остановить ответ.",
  "Click + название кнопки без артикля (Retry, Stop). to try = чтобы попробовать (цель, гл. 10).", ["Click Retry."]),
 ("limit", "You have reached the usage limit.", "Ты достиг лимита использования.", "The limit resets in a few hours.", "Лимит обновится через несколько часов.",
  "have reached = Present Perfect, учим как готовую фразу. the limit: известный лимит (гл. 8). in a few hours = через пару часов (гл. 11).", ["Usage limit reached.", "You reached the usage limit."]),
 ("expired", "Your session has expired.", "Твоя сессия истекла.", "Your login expired. Sign in again.", "Вход истёк. Войди снова.",
  "has expired = Present Perfect, готовая фраза. После истечения нужно войти заново.", ["The session has expired.", "Your session expired."]),
 ("shortcut", "Use a keyboard shortcut.", "Используй сочетание клавиш.", "What is the shortcut for copy?", "Какое сочетание клавиш для копирования?",
  "a keyboard shortcut: a (гл. 8). shortcut FOR + действия (гл. 11).", ["Use a shortcut."]),
 ("drag", "Drag and drop the file here.", "Перетащи файл сюда.", "Drag the file into the window.", "Перетащи файл в окно.",
  "drag and drop = перетащить (устойчивая пара). into the window = внутрь окна (гл. 11).", ["Drag the file here."]),
]

PACKS = {
  "core1": {"title": "Ядро речи 1", "desc": "Ходовые фразы для живого диалога: просьбы, вопросы, реакции. Каждая фраза с грамматическим крючком."},
  "ui1": {"title": "Интерфейс и техника 1", "desc": "Слова и сообщения из Claude Desktop, Windows и Android: кнопки, настройки, ошибки, обновления."},
}

def main(path):
    data = json.load(open(path, encoding="utf-8"))
    have = {c["id"] for c in data["cards"]}
    added = 0
    for pack, items, prefix in (("core1", CORE, "k-"), ("ui1", UI, "u-")):
        for (slug, en, ru, ex, exRu, note, alts) in items:
            cid = prefix + slug
            if cid in have:
                continue
            card = {"id": cid, "type": "phrase", "lesson": LESSON, "pack": pack,
                    "en": en, "ru": ru, "ex": ex, "exRu": exRu, "note": note}
            if alts:
                card["alts"] = alts
            data["cards"].append(card)
            have.add(cid)
            added += 1
    data["packs"] = PACKS
    data["updated"] = LESSON
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("добавлено", added, "| всего карточек", len(data["cards"]))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "cards.json")
