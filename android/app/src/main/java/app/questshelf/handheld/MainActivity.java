package app.questshelf.handheld;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RetroFolderPickerPlugin.class);
        registerPlugin(BackupExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
