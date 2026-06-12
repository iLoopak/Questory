package app.questshelf.handheld;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

@CapacitorPlugin(name = "NativeBackupExport")
public class BackupExportPlugin extends Plugin {
    private static final String BACKUP_MIME_TYPE = "application/json";

    @PluginMethod
    public void exportBackup(PluginCall call) {
        String contents = call.getString("contents", "");
        String requestedFilename = call.getString("filename", "questshelf-backup.json");
        String filename = sanitizeJsonFilename(requestedFilename);

        if (contents == null || contents.trim().isEmpty()) {
            call.reject("Backup data was empty.");
            return;
        }

        try {
            File backupDirectory = new File(getContext().getCacheDir(), "backups");
            if (!backupDirectory.exists() && !backupDirectory.mkdirs()) {
                call.reject("QuestShelf could not create the backup export folder.");
                return;
            }

            File backupFile = new File(backupDirectory, filename);
            try (FileOutputStream outputStream = new FileOutputStream(backupFile, false)) {
                outputStream.write(contents.getBytes(StandardCharsets.UTF_8));
            }

            Uri backupUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                backupFile
            );

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(BACKUP_MIME_TYPE);
            shareIntent.putExtra(Intent.EXTRA_STREAM, backupUri);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, filename);
            shareIntent.putExtra(Intent.EXTRA_TITLE, filename);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooserIntent = Intent.createChooser(shareIntent, "Export QuestShelf backup");
            chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooserIntent);

            JSObject response = new JSObject();
            response.put("fileName", filename);
            response.put("uri", backupUri.toString());
            call.resolve(response);
        } catch (Exception error) {
            call.reject("QuestShelf could not export the backup file.", error);
        }
    }

    private String sanitizeJsonFilename(String filename) {
        String sanitized = filename == null ? "" : filename.replaceAll("[^A-Za-z0-9._-]", "-");

        if (sanitized.trim().isEmpty()) {
            sanitized = "questshelf-backup.json";
        }

        if (!sanitized.toLowerCase(Locale.ROOT).endsWith(".json")) {
            sanitized = sanitized + ".json";
        }

        return sanitized;
    }
}
