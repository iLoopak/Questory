package app.questshelf.handheld;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.util.Log;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(name = "NativeBackupExport")
public class BackupExportPlugin extends Plugin {
    private static final String BACKUP_MIME_TYPE = "application/json";
    private static final String TAG = "QuestoryBackupExport";

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
                call.reject("Questory could not create the backup export folder.");
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
            shareIntent.setClipData(ClipData.newUri(getContext().getContentResolver(), filename, backupUri));
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            grantBackupReadPermission(shareIntent, backupUri);

            Intent chooserIntent = Intent.createChooser(shareIntent, "Export Questory backup");
            chooserIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Activity activity = getActivity();
            if (activity != null) {
                activity.startActivity(chooserIntent);
            } else {
                chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooserIntent);
            }

            JSObject response = new JSObject();
            response.put("fileName", filename);
            response.put("uri", backupUri.toString());
            call.resolve(response);
        } catch (Exception error) {
            Log.e(TAG, "Questory backup export failed.", error);
            call.reject("Questory could not export the backup file: " + readableErrorMessage(error), error);
        }
    }

    private void grantBackupReadPermission(Intent shareIntent, Uri backupUri) {
        List<ResolveInfo> receivingActivities = getContext()
            .getPackageManager()
            .queryIntentActivities(shareIntent, 0);

        for (ResolveInfo receivingActivity : receivingActivities) {
            getContext().grantUriPermission(
                receivingActivity.activityInfo.packageName,
                backupUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
        }
    }

    private String readableErrorMessage(Exception error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return error.getClass().getSimpleName();
        }

        return message;
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
