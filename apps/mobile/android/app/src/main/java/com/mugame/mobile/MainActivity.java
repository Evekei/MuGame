package com.mugame.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.mugame.mobile.plugins.NeteaseAuthPlugin;
import com.mugame.mobile.plugins.NeteasePlayerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NeteaseAuthPlugin.class);
        registerPlugin(NeteasePlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
