package com.iona.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ContactPicker — minimal in-house bridge for the Contacts mirror's "Choose from your
 * contacts" (Phase B). Uses the SYSTEM contact picker (ACTION_PICK on the Phone content
 * URI): the OS returns exactly ONE chosen phone row via a temporarily-granted URI, so it
 * needs NO READ_CONTACTS permission and never prompts. Returns { name, tel }; a cancel /
 * no selection resolves empty (JS treats a missing tel as a no-op).
 *
 * Built in-house rather than @capacitor-community/contacts: that plugin's latest (7.2.0)
 * targets Capacitor 7 and this app is on Capacitor 8 — no version gamble (owner Decision 2).
 * Mirrors the app's existing native-plugin convention (FlicPlugin / TwilioVoicePlugin).
 */
@CapacitorPlugin(name = "ContactPicker")
public class ContactPickerPlugin extends Plugin {

    @PluginMethod
    public void pickContact(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
            startActivityForResult(call, intent, "pickContactResult");
        } catch (Exception e) {
            call.reject("Contact picker unavailable");
        }
    }

    @ActivityCallback
    private void pickContactResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        if (result == null || result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null || result.getData().getData() == null) {
            call.resolve(ret);   // cancelled / nothing chosen — empty result, JS no-ops
            return;
        }
        Uri uri = result.getData().getData();
        String name = "";
        String tel = "";
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                uri,
                new String[]{
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                },
                null, null, null
            );
            if (c != null && c.moveToFirst()) {
                int ni = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int ti = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                if (ni >= 0 && c.getString(ni) != null) name = c.getString(ni);
                if (ti >= 0 && c.getString(ti) != null) tel = c.getString(ti);
            }
        } catch (Exception e) {
            // never crash the picker — fall through with whatever was read (possibly empty)
        } finally {
            if (c != null) c.close();
        }
        ret.put("name", name);
        ret.put("tel", tel);
        call.resolve(ret);
    }
}
