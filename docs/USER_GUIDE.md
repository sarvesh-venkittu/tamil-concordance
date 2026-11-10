# Tamil Concordance: a simple guide

This guide is for anyone using the app, with no computer experience needed.

---

## 1. Install it (one time only)

1. Open the file **Tamil-Concordance…dmg** that you were sent or downloaded. There are two versions:
   *arm64* for newer Macs with an Apple chip (M1, M2, M3…) and *x64* for older Intel Macs.
   ( menu → About This Mac shows which one you have.)
2. A window opens. **Drag the red அ icon onto the Applications folder.**
3. Open **Applications** and double-click **Tamil Concordance**.
4. The first time, the Mac will say it can't check the app. This is normal for apps that aren't
   from the App Store.
   - Click **Done** (or **OK**).
   - Open **System Settings** (the grey gear ⚙ in the Dock, or  menu → System Settings).
   - Click **Privacy & Security** on the left and scroll down.
   - Click **Open Anyway** next to *Tamil Concordance*, then type your Mac password if asked.
   - *(Older Macs: instead, hold **Control**, click the app, choose **Open**, then **Open** again.)*

**If the icon just keeps bouncing in the Dock and nothing opens** (common when the app arrived by
email or AirDrop):

1. Right-click the bouncing icon in the Dock → **Quit** (or **Force Quit**).
2. Open **Terminal** (press ⌘ Space, type *Terminal*, press Return).
3. Paste this line and press Return:

   ```
   xattr -cr "/Applications/Tamil Concordance.app"
   ```

4. Open the app again.

If Terminal answers **Operation not permitted**, macOS is protecting the Applications folder from
Terminal. Allow it once: **System Settings → Privacy & Security → App Management**, switch on
**Terminal**, quit and reopen Terminal, then paste the line again.

This removes the "downloaded from the internet" flag that macOS puts on apps that aren't from the
App Store. It only affects this one app.

From then on it opens like any other app. Tip: right-click its icon in the Dock and choose
**Options → Keep in Dock**.

---

## 2. Add your books

1. Go to **projectmadurai.org** (the app has a **Get books from Project Madurai ↗** link) and
   download the **PDF** of any book you want. It goes to your **Downloads** folder.
2. In the app, click **My Books** at the top.
3. Click **＋ Add books**, open **Downloads**, choose the PDF(s) and click **Add**.
   *Or drag the PDF files straight into the window.*
4. Wait a few seconds while each book is read. A ✓ appears when it's ready.

Your books stay in the app, so you don't need to add them again. Click **Rename** to change how
a book's name appears, or **Remove** to stop searching it.

> If a book shows a ⚠ warning, some of its text could not be read. Download the **Unicode / HTML**
> version of the same book from Project Madurai and add that instead.

---

## 3. Search

1. Click **Search** at the top.
2. Type the word **in English letters**, for example `aRam` for அறம்.
3. A list of Tamil spellings appears. The number on the right shows how many times each one is
   in your books.
   - Press the **Space bar** to take the first one,
   - or press **2**, **3**, … to take another,
   - or click the one you want.
4. Every line containing that word appears, grouped by book, with the page number.
   **Click a line** to see the lines around it.

Spelling help for English letters:

| Type | Get | | Type | Get |
|---|---|---|---|---|
| `a` | அ | | `L` | ள |
| `aa` or `A` | ஆ | | `N` | ண |
| `i` | இ | | `R` | ற |
| `ee` or `I` | ஈ | | `zh` | ழ |
| `u` | உ | | `ng` | ங |
| `oo` or `U` | ஊ | | `nj` | ஞ |
| `e` / `E` | எ / ஏ | | `th` | த |
| `ai` | ஐ | | `t` / `T` | ட |
| `o` / `O` | ஒ / ஓ | | `sh` | ஷ |

**Choices next to the search box**

- **Exact word**: only that exact word.
- **+ Inflected forms**: also the word with endings (அரசு → அரசன், அரசர்க்கு; நிலம் → நிலத்தில்).
  This is usually best.
- **+ Inside compounds**: also where the word is joined inside a longer word, as often happens in
  old verse (தாமரை inside செந்தாமரைக்).

The number on each button tells you how many lines it finds. Under each line, a small label
says which kind of match it is. The bars at the top show how many times the word appears in each book.

The small "chips" above the results list each different form of the word. Click one to see only
that form, and click it again to see all forms.

The **அ** button inside the search box turns English-to-Tamil typing off and on. Turn it off to type
Tamil with a Tamil keyboard, or to paste a Tamil word.

---

## 4. Make the text bigger

Click **A+** at the top right (or **A−** for smaller). The app remembers your choice.
