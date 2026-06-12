package app.questshelf.handheld;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.webkit.MimeTypeMap;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;
import java.util.Locale;

@CapacitorPlugin(name = "RetroFolderPicker")
public class RetroFolderPickerPlugin extends Plugin {
    private static final int MAX_SCAN_DEPTH = 24;

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @PluginMethod
    public void rescanFolder(PluginCall call) {
        String folderUri = call.getString("folderUri", "");

        if (folderUri == null || folderUri.trim().isEmpty()) {
            call.reject("Missing folderUri for rescan.");
            return;
        }

        Uri treeUri = Uri.parse(folderUri);
        resolveFolder(call, treeUri, false);
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("No folder was selected.");
            return;
        }

        Uri treeUri = result.getData().getData();
        int flags = result.getData().getFlags()
            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

        try {
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags & Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // Some providers grant one-time access only. The selected folder can still be scanned now.
        }

        resolveFolder(call, treeUri, true);
    }

    private void resolveFolder(PluginCall call, Uri treeUri, boolean pickedNow) {
        try {
            JSArray files = new JSArray();
            ContentResolver resolver = getContext().getContentResolver();
            String documentId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri rootDocumentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
            scanDocumentTree(resolver, treeUri, rootDocumentUri, "", files, 0);

            JSObject response = new JSObject();
            response.put("folderUri", treeUri.toString());
            response.put("files", files);
            response.put("persisted", hasPersistedReadPermission(treeUri));
            response.put("pickedNow", pickedNow);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("QuestShelf could not scan the selected folder.", error);
        }
    }

    private void scanDocumentTree(ContentResolver resolver, Uri treeUri, Uri documentUri, String relativePrefix, JSArray files, int depth) {
        if (depth > MAX_SCAN_DEPTH) {
            return;
        }

        String documentId = DocumentsContract.getDocumentId(documentUri);
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, documentId);
        String[] projection = new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
        };

        try (Cursor cursor = resolver.query(childrenUri, projection, null, null, null)) {
            if (cursor == null) {
                return;
            }

            while (cursor.moveToNext()) {
                String childDocumentId = cursor.getString(0);
                String displayName = cursor.getString(1);
                String mimeType = cursor.getString(2);
                long size = cursor.isNull(3) ? 0 : cursor.getLong(3);
                String safeName = displayName == null || displayName.trim().isEmpty() ? "Untitled" : displayName;
                Uri childUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, childDocumentId);
                String relativePath = relativePrefix.isEmpty() ? safeName : relativePrefix + "/" + safeName;

                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mimeType)) {
                    scanDocumentTree(resolver, treeUri, childUri, relativePath, files, depth + 1);
                    continue;
                }

                JSObject file = new JSObject();
                file.put("name", safeName);
                file.put("path", relativePath);
                file.put("uri", childUri.toString());
                file.put("mimeType", mimeType == null ? guessMimeType(safeName) : mimeType);
                file.put("size", size);
                files.put(file);
            }
        }
    }

    private boolean hasPersistedReadPermission(Uri treeUri) {
        String targetUri = treeUri.toString();

        for (android.content.UriPermission permission : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (permission.isReadPermission() && permission.getUri().toString().equals(targetUri)) {
                return true;
            }
        }

        return false;
    }

    private String guessMimeType(String fileName) {
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex < 0 || dotIndex == fileName.length() - 1) {
            return "application/octet-stream";
        }

        String extension = fileName.substring(dotIndex + 1).toLowerCase(Locale.ROOT);
        String mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return mimeType == null ? "application/octet-stream" : mimeType;
    }
}
